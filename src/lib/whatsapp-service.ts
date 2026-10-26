// The database side of WhatsApp class reminders and notices: who a message
// goes to, consent, the daily 10:00 reminder run, and ad hoc notices. The
// pure rules are in whatsapp-notices.ts; the HTTP call is in whatsapp-send.ts.
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import { dayCodeFromDate, OPERATING_DAYS } from "@/lib/schedule";
import {
  NOTICE_TYPES,
  TEMPLATE_NOTICE,
  TEMPLATE_RESCHEDULED,
  clockLabel,
  istDateString,
  normalizePhone,
  recipientPhones,
  reminderMessage,
  shortDateLabel,
  type ClassProgress,
  type NoticeTypeKey,
} from "@/lib/whatsapp-notices";
import { sendTemplate, sendText, whatsappConfigured } from "@/lib/whatsapp-send";
import { cleanReplyText, isReplyWindowOpen, isUnread } from "@/lib/whatsapp-inbox";
import { attendanceForSubscription, countUsedClasses, subscriptionTotals } from "@/lib/subscription";

// ---- consent --------------------------------------------------------------

export async function setConsent(phone: string, optedIn: boolean, source: string) {
  const now = new Date();
  await prisma.whatsAppContact.upsert({
    where: { phone },
    create: { phone, optedIn, source, optedInAt: optedIn ? now : null, optedOutAt: optedIn ? null : now },
    update: optedIn ? { optedIn: true, source, optedInAt: now, optedOutAt: null } : { optedIn: false, source, optedOutAt: now },
  });
}

// A student's family writing to us first counts as agreeing to class
// messages — but never silently overrides an earlier STOP (they can send
// START to come back).
export async function recordInboundConsent(phone: string) {
  const existing = await prisma.whatsAppContact.findUnique({ where: { phone } });
  if (existing && !existing.optedIn && existing.optedOutAt) return;
  if (existing?.optedIn) return;
  await setConsent(phone, true, "whatsapp-reply");
}

// Students and guardians whose stored number matches this one. The CRM keeps
// phone numbers as typed ("98457 08094"), so compare on digits only.
export async function findStudentOrUserByPhone(phone: string): Promise<boolean> {
  const digits = phone.replace(/\D/g, "");
  const tail = phone.startsWith("+") ? digits : digits.slice(-10);
  if (tail.length < 8) return false;
  const like = `%${tail}`;
  const [students, users] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`select id from "Student" where regexp_replace(coalesce(phone, ''), '\D', '', 'g') like ${like} limit 1`,
    prisma.$queryRaw<{ id: string }[]>`select id from "User" where regexp_replace(coalesce(phone, ''), '\D', '', 'g') like ${like} limit 1`,
  ]);
  return students.length > 0 || users.length > 0;
}

// ---- who gets a message ---------------------------------------------------

export type ClassRecipient = {
  studentId: string;
  studentName: string;
  batchId: string;
  courseName: string;
  startTime: string;
  teacherName: string | null;
  // Classes completed vs. classes in the student's CURRENT subscription for
  // this instrument (same numbers as the student page); null if they have none.
  progress: ClassProgress | null;
  phones: { phone: string; consented: boolean }[];
};

// Everyone enrolled (actively, and as an active student) in these batches,
// with the number(s) to message and whether each has agreed to WhatsApp.
export async function recipientsForBatches(batchIds: string[]): Promise<ClassRecipient[]> {
  if (batchIds.length === 0) return [];
  const enrollments = await prisma.enrollment.findMany({
    where: { status: "ACTIVE", student: { status: "ACTIVE" }, batchId: { in: batchIds } },
    include: {
      student: { include: { guardians: { include: { user: { select: { phone: true } } } } } },
      batch: { include: { course: true, teacher: true } },
    },
    orderBy: [{ batch: { startTime: "asc" } }, { student: { name: "asc" } }],
  });

  // Current (ACTIVE) subscription per student + instrument, with the live
  // attendance count — computed exactly as on the student page.
  const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));
  const [subscriptions, attendance] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: "ACTIVE", studentId: { in: studentIds } },
      include: { bonusGrants: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.attendance.findMany({ where: { studentId: { in: studentIds }, status: "PRESENT" }, select: { studentId: true, courseId: true, date: true, status: true } }),
  ]);
  const progressOf = (studentId: string, courseId: string): ClassProgress | null => {
    const sub = subscriptions.find((s) => s.studentId === studentId && s.courseId === courseId);
    if (!sub) return null;
    const mine = attendance.filter((a) => a.studentId === studentId && a.courseId === courseId);
    const totals = subscriptionTotals(sub, countUsedClasses(attendanceForSubscription(sub.startDate, mine)));
    return { used: totals.used, total: totals.totalClasses };
  };

  const rows = enrollments.map((e) => ({
    studentId: e.studentId,
    studentName: e.student.name,
    batchId: e.batchId,
    courseName: e.batch.course.name,
    startTime: e.batch.startTime,
    teacherName: e.batch.teacher?.name ?? null,
    progress: progressOf(e.studentId, e.batch.courseId),
    phones: recipientPhones(e.student.guardians.map((g) => g.user.phone), e.student.phone),
  }));

  const allPhones = Array.from(new Set(rows.flatMap((r) => r.phones)));
  const optedIn = new Set(
    (await prisma.whatsAppContact.findMany({ where: { phone: { in: allPhones }, optedIn: true }, select: { phone: true } })).map((c) => c.phone)
  );

  return rows.map((r) => ({ ...r, phones: r.phones.map((phone) => ({ phone, consented: optedIn.has(phone) })) }));
}

export async function batchesOnDate(date: Date) {
  const day = dayCodeFromDate(date);
  if (!OPERATING_DAYS.includes(day)) return [];
  return prisma.batch.findMany({
    where: { dayOfWeek: day },
    include: { course: true, teacher: true },
    orderBy: [{ startTime: "asc" }, { name: "asc" }],
  });
}

// ---- sending, with a log row per message ----------------------------------

type Outcome = "sent" | "failed" | "duplicate";

async function sendLogged(args: {
  kind: "REMINDER" | "NOTICE";
  phone: string;
  studentId: string;
  noticeId?: string;
  template: string;
  params: string[];
  summary: string;
  dedupeKey: string;
}): Promise<Outcome> {
  const data = {
    kind: args.kind,
    phone: args.phone,
    studentId: args.studentId,
    noticeId: args.noticeId ?? null,
    template: args.template,
    summary: args.summary,
    dedupeKey: args.dedupeKey,
  };
  let rowId: string;
  try {
    rowId = (await prisma.whatsAppMessage.create({ data })).id;
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    // Already handled — but a message that failed last time is worth retrying.
    const existing = await prisma.whatsAppMessage.findUnique({ where: { dedupeKey: args.dedupeKey } });
    if (!existing || existing.status !== "FAILED") return "duplicate";
    rowId = existing.id;
  }

  const result = await sendTemplate(args.phone, args.template, args.params);
  await prisma.whatsAppMessage.update({
    where: { id: rowId },
    data: result.ok
      ? { status: result.dryRun ? "DRY_RUN" : "SENT", waMessageId: result.id, sentAt: new Date(), error: null }
      : { status: "FAILED", error: result.error },
  });
  return result.ok ? "sent" : "failed";
}

type Tally = { sent: number; failed: number; duplicate: number; noConsent: number };
const emptyTally = (): Tally => ({ sent: 0, failed: 0, duplicate: 0, noConsent: 0 });

// ---- the daily reminder run ----------------------------------------------

export type ReminderRun =
  | { ran: false; reason: string }
  | ({ ran: true; date: string; classes: number; suppressedBatches: number } & Tally);

// Sends "your class is today" for every class today (India date), unless a
// sent notice already cancelled or moved that class. Safe to run twice: each
// message has a unique key, so nobody is messaged twice for the same class.
export async function runClassReminders(now = new Date()): Promise<ReminderRun> {
  if (!whatsappConfigured()) return { ran: false, reason: "WhatsApp sending is not configured" };

  const dateStr = istDateString(now);
  const date = parseDateOnly(dateStr);
  if (!OPERATING_DAYS.includes(dayCodeFromDate(date))) return { ran: false, reason: "No classes today (Monday holiday)" };

  const suppressedTypes = (Object.keys(NOTICE_TYPES) as NoticeTypeKey[]).filter((t) => NOTICE_TYPES[t].suppressesReminder);
  const notices = await prisma.notice.findMany({ where: { date, sentAt: { not: null }, type: { in: suppressedTypes } }, select: { batchIds: true } });
  const suppressed = new Set(notices.flatMap((n) => n.batchIds));

  const batches = (await batchesOnDate(date)).filter((b) => !suppressed.has(b.id));
  const recipients = await recipientsForBatches(batches.map((b) => b.id));

  const tally = emptyTally();
  for (const r of recipients) {
    for (const { phone, consented } of r.phones) {
      if (!consented) {
        tally.noConsent++;
        continue;
      }
      const outcome = await sendLogged({
        kind: "REMINDER",
        phone,
        studentId: r.studentId,
        ...reminderMessage(r, r.progress),
        summary: `${r.courseName} ${clockLabel(r.startTime)} · ${r.studentName}`,
        dedupeKey: `reminder:${dateStr}:${r.studentId}:${r.batchId}:${phone}`,
      });
      tally[outcome]++;
    }
  }
  return { ran: true, date: dateStr, classes: batches.length, suppressedBatches: suppressed.size, ...tally };
}

// ---- ad hoc notices -------------------------------------------------------

export type NoticeInput = {
  type: NoticeTypeKey;
  dateStr: string; // class date, "YYYY-MM-DD"
  batchIds: string[];
  message: string;
  newDateStr?: string; // RESCHEDULE
  newStartTime?: string; // RESCHEDULE, "HH:MM"
  createdById?: string;
};

export async function createAndSendNotice(input: NoticeInput): Promise<{ noticeId: string } & Tally> {
  const { type, dateStr, batchIds } = input;
  if (batchIds.length === 0) throw new Error("Choose at least one class");
  const date = parseDateOnly(dateStr);
  const isReschedule = type === "RESCHEDULE";
  if (isReschedule && (!input.newDateStr || !input.newStartTime)) throw new Error("A reschedule needs the new date and time");
  if (!isReschedule && !input.message.trim()) throw new Error("Write the message to send");

  const notice = await prisma.notice.create({
    data: {
      type,
      date,
      batchIds,
      message: input.message.trim(),
      newDate: isReschedule && input.newDateStr ? parseDateOnly(input.newDateStr) : null,
      newStartTime: isReschedule ? input.newStartTime : null,
      createdById: input.createdById ?? null,
    },
  });

  const recipients = await recipientsForBatches(batchIds);
  const tally = emptyTally();
  for (const r of recipients) {
    for (const { phone, consented } of r.phones) {
      if (!consented) {
        tally.noConsent++;
        continue;
      }
      const oldSlot = `${shortDateLabel(date)}, ${clockLabel(r.startTime)}`;
      const newSlot = isReschedule ? `${shortDateLabel(parseDateOnly(input.newDateStr!))}, ${clockLabel(input.newStartTime!)}` : "";
      const outcome = await sendLogged({
        kind: "NOTICE",
        phone,
        studentId: r.studentId,
        noticeId: notice.id,
        template: isReschedule ? TEMPLATE_RESCHEDULED : TEMPLATE_NOTICE,
        params: isReschedule
          ? [r.studentName, r.courseName, oldSlot, newSlot]
          : [r.studentName, r.courseName, shortDateLabel(date), input.message],
        summary: `${NOTICE_TYPES[type].label} · ${r.courseName} ${clockLabel(r.startTime)} · ${r.studentName}`,
        dedupeKey: `notice:${notice.id}:${r.studentId}:${r.batchId}:${phone}`,
      });
      tally[outcome]++;
    }
  }

  await prisma.notice.update({ where: { id: notice.id }, data: { sentAt: new Date(), recipientCount: tally.sent + tally.failed } });
  return { noticeId: notice.id, ...tally };
}


// A plain-text reply inside the 24 hours after the customer wrote to us (used
// to confirm STOP / START). Logged like everything else we send.
export async function sendReply(phone: string, text: string, key: string) {
  try {
    const row = await prisma.whatsAppMessage.create({
      data: { kind: "REPLY", phone, template: "text", body: text, summary: text.slice(0, 80), dedupeKey: `reply:${key}` },
    });
    const result = await sendText(phone, text);
    await prisma.whatsAppMessage.update({
      where: { id: row.id },
      data: result.ok
        ? { status: result.dryRun ? "DRY_RUN" : "SENT", waMessageId: result.id, sentAt: new Date() }
        : { status: "FAILED", error: result.error },
    });
  } catch (e) {
    // A repeat of the same inbound message (unique key) or a logging hiccup
    // must never break handling of the webhook.
    console.warn("[whatsapp] reply not sent:", e instanceof Error ? e.message : e);
  }
}

// ---- inbox ----------------------------------------------------------------

// Stores a message from a family or enquirer and marks their conversation
// unread. Returns false when this exact message was already stored (Meta
// re-sends a webhook it didn't get a quick 200 for), so nothing downstream
// runs twice.
export async function recordInbound(msg: { id: string; phone: string; name: string | null; text: string; at: Date | null }): Promise<boolean> {
  const when = msg.at ?? new Date();
  try {
    await prisma.whatsAppMessage.create({
      data: {
        kind: "INBOUND",
        phone: msg.phone,
        template: "inbound",
        body: msg.text,
        summary: msg.text.slice(0, 80),
        status: "RECEIVED",
        waMessageId: msg.id,
        dedupeKey: `in:${msg.id}`,
        createdAt: when,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
  const existing = await prisma.whatsAppContact.findUnique({ where: { phone: msg.phone }, select: { lastInboundAt: true } });
  const newest = existing?.lastInboundAt && existing.lastInboundAt > when ? existing.lastInboundAt : when;
  await prisma.whatsAppContact.upsert({
    where: { phone: msg.phone },
    create: { phone: msg.phone, name: msg.name, lastInboundAt: newest },
    update: { name: msg.name ?? undefined, lastInboundAt: newest },
  });
  return true;
}

export async function markConversationRead(phone: string) {
  await prisma.whatsAppContact.updateMany({ where: { phone, lastInboundAt: { not: null } }, data: { lastReadAt: new Date() } });
}

export async function unreadConversationCount(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    select count(*) as n from "WhatsAppContact"
    where "lastInboundAt" is not null and ("lastReadAt" is null or "lastReadAt" < "lastInboundAt")`;
  return Number(rows[0]?.n ?? 0);
}

// A free-text reply from staff, allowed only inside WhatsApp's 24-hour window.
export async function sendConversationReply(phone: string, rawText: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = cleanReplyText(rawText);
  if (!text) return { ok: false, error: "Write a message first." };
  const contact = await prisma.whatsAppContact.findUnique({ where: { phone }, select: { lastInboundAt: true } });
  if (!isReplyWindowOpen(contact?.lastInboundAt)) {
    return { ok: false, error: "The 24-hour window for free-text replies has closed. Send a notice (an approved template) instead." };
  }
  const row = await prisma.whatsAppMessage.create({
    data: { kind: "REPLY", phone, template: "text", body: text, summary: text.slice(0, 80), dedupeKey: `reply-out:${randomUUID()}` },
  });
  const result = await sendText(phone, text);
  await prisma.whatsAppMessage.update({
    where: { id: row.id },
    data: result.ok
      ? { status: result.dryRun ? "DRY_RUN" : "SENT", waMessageId: result.id, sentAt: new Date() }
      : { status: "FAILED", error: result.error },
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export type PhoneOwners = { students: { id: string; name: string; status: string }[]; lead: { id: string; name: string } | null };

// Which students (as the student or as a parent/guardian) and which lead a
// phone number belongs to. The CRM stores numbers as typed, so compare on the
// normalised form.
export async function ownersOfPhones(phones: string[]): Promise<Map<string, PhoneOwners>> {
  const wanted = new Set(phones);
  const owners = new Map<string, PhoneOwners>(phones.map((p) => [p, { students: [], lead: null }]));
  if (phones.length === 0) return owners;

  const students = await prisma.student.findMany({
    select: { id: true, name: true, status: true, phone: true, guardians: { select: { user: { select: { phone: true } } } } },
  });
  for (const s of students) {
    const numbers = new Set([s.phone, ...s.guardians.map((g) => g.user.phone)].map((p) => normalizePhone(p)).filter((p): p is string => !!p));
    for (const n of numbers) if (wanted.has(n)) owners.get(n)!.students.push({ id: s.id, name: s.name, status: s.status });
  }
  const leads = await prisma.lead.findMany({ where: { phone: { in: phones } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, phone: true } });
  for (const l of leads) {
    const o = owners.get(l.phone);
    if (o && !o.lead) o.lead = { id: l.id, name: l.name };
  }
  return owners;
}

export async function listConversations(limit = 100) {
  const contacts = await prisma.whatsAppContact.findMany({ where: { lastInboundAt: { not: null } }, orderBy: { lastInboundAt: "desc" }, take: limit });
  const phones = contacts.map((c) => c.phone);
  const [recent, owners] = await Promise.all([
    prisma.whatsAppMessage.findMany({ where: { phone: { in: phones } }, orderBy: { createdAt: "desc" }, take: 600 }),
    ownersOfPhones(phones),
  ]);
  const lastByPhone = new Map<string, (typeof recent)[number]>();
  for (const m of recent) if (!lastByPhone.has(m.phone)) lastByPhone.set(m.phone, m);
  return contacts.map((c) => ({
    phone: c.phone,
    name: c.name,
    lastInboundAt: c.lastInboundAt!,
    unread: isUnread(c),
    last: lastByPhone.get(c.phone) ?? null,
    owners: owners.get(c.phone)!,
  }));
}

export async function getThread(phone: string) {
  const [contact, messages, owners] = await Promise.all([
    prisma.whatsAppContact.findUnique({ where: { phone } }),
    prisma.whatsAppMessage.findMany({ where: { phone }, orderBy: { createdAt: "desc" }, take: 200 }),
    ownersOfPhones([phone]),
  ]);
  return { contact, messages: messages.reverse(), owners: owners.get(phone)! };
}
