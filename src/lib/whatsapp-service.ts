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
  DEFAULT_REMINDER_TIME,
  canAutoConsent,
  clockLabel,
  compPickKey,
  compReminderMessage,
  dedupeCompRecipients,
  istDateString,
  normalizePhone,
  recipientPhones,
  reminderDecision,
  reminderMessage,
  reminderRunDue,
  shortDateLabel,
  type ClassProgress,
  type ReminderDecision,
  type NoticeTypeKey,
} from "@/lib/whatsapp-notices";
import { sendButtons, sendList, sendTemplate, sendText, setWhatsAppBlock, whatsappConfigured } from "@/lib/whatsapp-send";
import { replyId, type ListRow } from "@/lib/class-reply";
import { replyStatus, type ReplyStatus } from "@/lib/class-confirm";
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

// Registering a student with classes is the agreement to class messages (the
// family is told so when they register), so the number(s) this student's
// messages go to are switched on as soon as they have an active class. Safe to
// call again: it never overrides a STOP or a spam block, and does nothing for
// a student with no active enrolment yet.
export async function recordRegistrationConsent(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { guardians: { include: { user: { select: { phone: true } } } }, enrollments: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 } },
  });
  if (!student || student.enrollments.length === 0) return;

  for (const phone of recipientPhones(student.guardians.map((g) => g.user.phone), student.phone)) {
    const existing = await prisma.whatsAppContact.findUnique({ where: { phone }, select: { optedIn: true, optedOutAt: true, blockedAt: true } });
    if (canAutoConsent(existing)) await setConsent(phone, true, "registration");
  }
}

// Students and guardians whose stored number matches this one. The CRM keeps
// phone numbers as typed ("98457 08094"), so compare on digits only.
export async function findStudentOrUserByPhone(phone: string): Promise<boolean> {
  const digits = phone.replace(/\D/g, "");
  const tail = phone.startsWith("+") ? digits : digits.slice(-10);
  if (tail.length < 8) return false;
  const like = `%${tail}`;
  const [students, users] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`select id from "Student" where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') like ${like} limit 1`,
    prisma.$queryRaw<{ id: string }[]>`select id from "User" where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') like ${like} limit 1`,
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
  remindersOff: boolean;
  makeUp: boolean; // here for a one-off make-up class on the date asked for, not their regular class
  phones: { phone: string; consented: boolean }[];
};

// Everyone enrolled (actively, and as an active student) in these batches,
// with the number(s) to message and whether each has agreed to WhatsApp.
//
// With `date`, students booked to make a class up in one of these batches ON
// THAT DATE are included too (marked makeUp) — a family told "come Wednesday at
// 6" gets the Wednesday reminder and any notice for that class.
export async function recipientsForBatches(batchIds: string[], date?: Date): Promise<ClassRecipient[]> {
  if (batchIds.length === 0) return [];
  const include = {
    student: { include: { guardians: { include: { user: { select: { phone: true } } } } } },
    batch: { include: { course: true, teacher: true } },
  } as const;
  const regular = await prisma.enrollment.findMany({
    where: { status: "ACTIVE", student: { status: "ACTIVE" }, batchId: { in: batchIds } },
    include,
    orderBy: [{ batch: { startTime: "asc" } }, { student: { name: "asc" } }],
  });

  const makeUps = date
    ? await prisma.classChange.findMany({
        where: { status: "BOOKED", kind: "MOVE", toDate: date, toBatchId: { in: batchIds }, student: { status: "ACTIVE" } },
        include: { student: include.student, toBatch: include.batch },
      })
    : [];
  const enrollments = [
    ...regular.map((e) => ({ studentId: e.studentId, batchId: e.batchId, student: e.student, batch: e.batch, makeUp: false })),
    ...makeUps.map((c) => ({ studentId: c.studentId, batchId: c.toBatchId!, student: c.student, batch: c.toBatch!, makeUp: true })),
  ].sort((a, b) => a.batch.startTime.localeCompare(b.batch.startTime) || a.student.name.localeCompare(b.student.name));

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
    remindersOff: e.student.remindersOff,
    makeUp: e.makeUp,
    phones: recipientPhones(e.student.guardians.map((g) => g.user.phone), e.student.phone),
  }));

  const allPhones = Array.from(new Set(rows.flatMap((r) => r.phones)));
  const optedIn = new Set(
    (await prisma.whatsAppContact.findMany({ where: { phone: { in: allPhones }, optedIn: true, blockedAt: null }, select: { phone: true } })).map((c) => c.phone)
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
  buttonPayloads?: string[];
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

  const result = await sendTemplate(args.phone, args.template, args.params, args.buttonPayloads);
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

// ---- reminder controls: pause switch, plan, run ----------------------------

export async function getRemindersPaused(): Promise<{ paused: boolean; changedAt: Date | null; changedBy: string | null }> {
  const row = await prisma.whatsAppSettings.findUnique({ where: { id: "main" } });
  return { paused: row?.remindersPaused ?? false, changedAt: row?.changedAt ?? null, changedBy: row?.changedBy ?? null };
}

export async function setRemindersPaused(paused: boolean, changedBy: string) {
  await prisma.whatsAppSettings.upsert({
    where: { id: "main" },
    create: { id: "main", remindersPaused: paused, changedBy },
    update: { remindersPaused: paused, changedAt: new Date(), changedBy },
  });
}

export async function getReminderButtons(): Promise<boolean> {
  return (await prisma.whatsAppSettings.findUnique({ where: { id: "main" } }))?.buttonReminders ?? false;
}

export async function setReminderButtons(on: boolean, changedBy: string) {
  await prisma.whatsAppSettings.upsert({
    where: { id: "main" },
    create: { id: "main", buttonReminders: on, changedBy },
    update: { buttonReminders: on },
  });
}

export type ReminderSchedule = { time: string; lastAutoRunDate: string | null; lastRunAt: Date | null; lastRunSummary: string | null };

export async function getReminderSchedule(): Promise<ReminderSchedule> {
  const row = await prisma.whatsAppSettings.findUnique({ where: { id: "main" } });
  return {
    time: row?.reminderTime ?? DEFAULT_REMINDER_TIME,
    lastAutoRunDate: row?.lastAutoRunDate ?? null,
    lastRunAt: row?.lastRunAt ?? null,
    lastRunSummary: row?.lastRunSummary ?? null,
  };
}

export async function setReminderTime(time: string, changedBy: string) {
  await prisma.whatsAppSettings.upsert({
    where: { id: "main" },
    create: { id: "main", reminderTime: time, changedBy },
    update: { reminderTime: time },
  });
}

export type ReminderPlanRow = {
  key: string; // the unique message key — also what stops a double send
  studentId: string;
  studentName: string;
  batchId: string;
  courseName: string;
  startTime: string;
  teacherName: string | null;
  progress: ClassProgress | null;
  remindersOff: boolean;
  skipped: boolean;
  makeUp: boolean; // a one-off make-up class, not their regular one
  phone: string | null;
  decision: ReminderDecision;
  // What happened if a reminder for this row has already been tried.
  sentStatus: "PENDING" | "SENT" | "FAILED" | "DRY_RUN" | null;
  error: string | null;
  // What the family answered (confirmed / can't come / rescheduled / no reply yet); null until the reminder has gone out.
  replyStatus: ReplyStatus | null;
};

export type ReminderPlan = { dateStr: string; isClassDay: boolean; rows: ReminderPlanRow[]; classes: number; noticeBatches: number };

// Everyone who has a class on this date, and for each number whether their
// reminder will be sent and, if not, why. This is the single source of truth:
// the 10 AM job sends exactly the rows marked SEND, and the Reminders page
// shows exactly these rows.
export async function planReminders(dateStr: string): Promise<ReminderPlan> {
  const date = parseDateOnly(dateStr);
  if (!OPERATING_DAYS.includes(dayCodeFromDate(date))) return { dateStr, isClassDay: false, rows: [], classes: 0, noticeBatches: 0 };

  const suppressedTypes = (Object.keys(NOTICE_TYPES) as NoticeTypeKey[]).filter((t) => NOTICE_TYPES[t].suppressesReminder);
  const notices = await prisma.notice.findMany({ where: { date, sentAt: { not: null }, type: { in: suppressedTypes } }, select: { batchIds: true } });
  const noticeBatches = new Set(notices.flatMap((n) => n.batchIds));

  const batches = await batchesOnDate(date);
  const recipients = await recipientsForBatches(batches.map((b) => b.id), date);
  const skips = await prisma.reminderSkip.findMany({ where: { date, studentId: { in: recipients.map((r) => r.studentId) } }, select: { studentId: true } });
  const skipped = new Set(skips.map((k) => k.studentId));

  const rows: ReminderPlanRow[] = [];
  for (const r of recipients) {
    const numbers = r.phones.length > 0 ? r.phones : [{ phone: null as string | null, consented: false }];
    for (const { phone, consented } of numbers) {
      rows.push({
        key: `reminder:${dateStr}:${r.studentId}:${r.batchId}:${phone ?? "none"}`,
        studentId: r.studentId,
        studentName: r.studentName,
        batchId: r.batchId,
        courseName: r.courseName,
        startTime: r.startTime,
        teacherName: r.teacherName,
        progress: r.progress,
        remindersOff: r.remindersOff,
        skipped: skipped.has(r.studentId) && !r.makeUp,
        makeUp: r.makeUp,
        phone,
        decision: reminderDecision({
          classHasNotice: noticeBatches.has(r.batchId),
          studentOff: r.remindersOff,
          // The skip is for the class they're missing; a make-up that same day is a different class.
          skippedToday: skipped.has(r.studentId) && !r.makeUp,
          phone,
          consented,
        }),
        sentStatus: null,
        error: null,
        replyStatus: null,
      });
    }
  }

  const tried = await prisma.whatsAppMessage.findMany({ where: { dedupeKey: { in: rows.map((r) => r.key) } }, select: { dedupeKey: true, status: true, error: true } });
  const byKey = new Map(tried.map((m) => [m.dedupeKey, m]));
  for (const row of rows) {
    const m = byKey.get(row.key);
    if (m && m.status !== "RECEIVED") {
      row.sentStatus = m.status as ReminderPlanRow["sentStatus"];
      row.error = m.error;
    }
  }
  const studentIds = Array.from(new Set(rows.map((r) => r.studentId)));
  const [confirmations, changes] = await Promise.all([
    prisma.classConfirmation.findMany({ where: { date, kind: "REGULAR", studentId: { in: studentIds } }, select: { studentId: true, batchId: true, answer: true } }),
    prisma.classChange.findMany({ where: { fromDate: date, status: "BOOKED", studentId: { in: studentIds } }, select: { studentId: true, fromBatchId: true, kind: true } }),
  ]);
  const answerOf = new Map(confirmations.map((c) => [`${c.studentId}|${c.batchId}`, c.answer]));
  const changeOf = new Map(changes.map((c) => [`${c.studentId}|${c.fromBatchId}`, c.kind]));
  for (const row of rows) {
    // A make-up booking gets no buttons, so there is nothing for its family to answer.
    if (row.makeUp) continue;
    const k = `${row.studentId}|${row.batchId}`;
    row.replyStatus = replyStatus({ sent: row.sentStatus === "SENT", answer: answerOf.get(k) ?? null, change: changeOf.get(k) ?? null });
  }
  return { dateStr, isClassDay: true, rows, classes: batches.length, noticeBatches: noticeBatches.size };
}

// What the reminder's two buttons send back: which student's class, and when.
export function reminderButtonPayloads(row: { studentId: string; batchId: string }, dateStr: string): string[] {
  const base = { studentId: row.studentId, batchId: row.batchId, date: dateStr };
  return [replyId({ kind: "yes", ...base }), replyId({ kind: "no", ...base })];
}

// What a comp class message's two buttons send back (the regular batch it makes up for, and today).
export function compButtonPayloads(row: { studentId: string; batchId: string }, dateStr: string): string[] {
  const base = { studentId: row.studentId, batchId: row.batchId, date: dateStr };
  return [replyId({ kind: "cyes", ...base }), replyId({ kind: "cno", ...base })];
}

export type ReminderRun =
  | { ran: false; reason: string }
  | ({ ran: true; date: string; classes: number; excluded: number } & Tally);

// Sends "your class is today" for every class today (India date) that the plan
// marks SEND. Does nothing while reminders are paused, unless staff asked for it
// by hand. Safe to run twice: each message has a unique key, so nobody is
// messaged twice for the same class (a failed one is retried).
export async function runClassReminders(now = new Date(), opts: { ignorePause?: boolean } = {}): Promise<ReminderRun> {
  if (!whatsappConfigured()) return { ran: false, reason: "WhatsApp sending is not configured" };
  if (!opts.ignorePause && (await getRemindersPaused()).paused) return { ran: false, reason: "Reminders are paused" };

  const dateStr = istDateString(now);
  const plan = await planReminders(dateStr);
  if (!plan.isClassDay) return { ran: false, reason: "No classes today (Monday holiday)" };

  const buttons = await getReminderButtons();
  const tally = emptyTally();
  let excluded = 0;
  for (const row of plan.rows) {
    if (row.decision === "NO_CONSENT") tally.noConsent++;
    else if (row.decision !== "SEND") excluded++;
    if (row.decision !== "SEND" || !row.phone) continue;
    const outcome = await sendLogged({
      kind: "REMINDER",
      phone: row.phone,
      studentId: row.studentId,
      // No buttons on a make-up reminder: "can't attend" there has no regular class to cancel.
      ...reminderMessage(row, row.progress, buttons && !row.makeUp ? reminderButtonPayloads(row, dateStr) : undefined),
      summary: `${row.courseName} ${clockLabel(row.startTime)} · ${row.studentName}`,
      dedupeKey: row.key,
    });
    tally[outcome]++;
  }
  return { ran: true, date: dateStr, classes: plan.classes, excluded, ...tally };
}

const runSummary = (run: ReminderRun) =>
  run.ran ? `${run.sent} sent${run.failed ? `, ${run.failed} failed` : ""}${run.duplicate ? `, ${run.duplicate} already sent` : ""}${run.noConsent ? `, ${run.noConsent} not agreed` : ""}` : run.reason;

// Remembers the last run that actually went out, and that today's reminders are done.
async function recordRun(run: ReminderRun, now: Date, by: string) {
  if (!run.ran) return;
  const data = { lastRunAt: now, lastRunSummary: `${by}: ${runSummary(run)}`, lastAutoRunDate: run.date };
  await prisma.whatsAppSettings.upsert({ where: { id: "main" }, create: { id: "main", ...data }, update: data });
}

export type ScheduledRun = ReminderRun | { ran: false; reason: string; due: false };

// What the server's every-few-minutes job calls. Sends today's reminders once,
// when the clock passes the time set on the Reminders page (and within the
// catch-up window after it); otherwise does nothing and says why.
export async function runScheduledReminders(now = new Date()): Promise<ScheduledRun> {
  const schedule = await getReminderSchedule();
  if (!reminderRunDue(now, schedule.time, schedule.lastAutoRunDate)) return { ran: false, reason: "Not due", due: false };
  const run = await runClassReminders(now);
  // A run that did nothing (paused, holiday) isn't recorded, so it can still go out once resumed.
  await recordRun(run, now, "Automatic");
  return run;
}

// "Send today's reminders now": works whether or not reminders are paused or the
// automatic run already happened. Anyone already sent is skipped, so it is safe
// to press more than once.
export async function sendRemindersNow(now = new Date()): Promise<ReminderRun> {
  const run = await runClassReminders(now, { ignorePause: true });
  await recordRun(run, now, "Sent by hand");
  return run;
}

// ---- ad hoc notices -------------------------------------------------------

export type NoticeInput = {
  type: NoticeTypeKey;
  dateStr: string; // class date, "YYYY-MM-DD"
  batchIds: string[];
  message: string;
  newDateStr?: string; // RESCHEDULE
  newStartTime?: string; // RESCHEDULE: the new start time; COMP_CLASS: the comp class's start time ("HH:MM")
  picks?: string[]; // COMP_CLASS: only these students' instruments (compPickKey) from the chosen batches get it
  createdById?: string;
};

export async function createAndSendNotice(input: NoticeInput): Promise<{ noticeId: string } & Tally> {
  const { type, dateStr, batchIds } = input;
  if (batchIds.length === 0) throw new Error("Choose at least one class");
  const date = parseDateOnly(dateStr);
  const isReschedule = type === "RESCHEDULE";
  const isComp = type === "COMP_CLASS";
  if (isReschedule && (!input.newDateStr || !input.newStartTime)) throw new Error("A reschedule needs the new date and time");
  if (isComp) {
    if (!input.newStartTime) throw new Error("A comp class needs its start time");
    // The message says "class is today", so a comp class is announced on its own day.
    if (dateStr !== istDateString(new Date())) throw new Error("A comp class message is for today's class");
    if (!input.picks?.length) throw new Error("Tick at least one student");
  }
  if (!isReschedule && !isComp && !input.message.trim()) throw new Error("Write the message to send");

  const notice = await prisma.notice.create({
    data: {
      type,
      date,
      batchIds,
      message: input.message.trim(),
      newDate: isReschedule && input.newDateStr ? parseDateOnly(input.newDateStr) : null,
      newStartTime: isReschedule || isComp ? input.newStartTime : null,
      createdById: input.createdById ?? null,
    },
  });

  // A comp class goes to the regular students of the chosen batches (whatever day
  // those batches meet), one message per student per instrument.
  const recipients = isComp
    ? dedupeCompRecipients((await recipientsForBatches(batchIds)).filter((r) => input.picks!.includes(compPickKey(r))))
    : await recipientsForBatches(batchIds, parseDateOnly(dateStr));
  const tally = emptyTally();
  const buttons = isComp && (await getReminderButtons());
  for (const r of recipients) {
    for (const { phone, consented } of r.phones) {
      if (!consented) {
        tally.noConsent++;
        continue;
      }
      const oldSlot = `${shortDateLabel(date)}, ${clockLabel(r.startTime)}`;
      const newSlot = isReschedule ? `${shortDateLabel(parseDateOnly(input.newDateStr!))}, ${clockLabel(input.newStartTime!)}` : "";
      const message = isComp
        ? compReminderMessage(r, input.newStartTime!, buttons ? compButtonPayloads(r, dateStr) : undefined)
        : {
            template: isReschedule ? TEMPLATE_RESCHEDULED : TEMPLATE_NOTICE,
            params: isReschedule ? [r.studentName, r.courseName, oldSlot, newSlot] : [r.studentName, r.courseName, shortDateLabel(date), input.message],
          };
      const outcome = await sendLogged({
        kind: "NOTICE",
        phone,
        studentId: r.studentId,
        noticeId: notice.id,
        ...message,
        summary: isComp
          ? `${NOTICE_TYPES[type].label} · ${r.courseName} ${clockLabel(input.newStartTime!)} · ${r.studentName}`
          : `${NOTICE_TYPES[type].label} · ${r.courseName} ${clockLabel(r.startTime)} · ${r.studentName}`,
        dedupeKey: `notice:${notice.id}:${r.studentId}:${r.batchId}:${phone}`,
      });
      tally[outcome]++;
    }
  }

  await prisma.notice.update({ where: { id: notice.id }, data: { sentAt: new Date(), recipientCount: tally.sent + tally.failed } });
  return { noticeId: notice.id, ...tally };
}


export type CompClassRow = { studentId: string; studentName: string; courseName: string; phones: string[]; status: ReplyStatus | "FAILED"; answeredAt: Date | null };
export type CompClassSent = { noticeId: string; time: string; sentAt: Date | null; rows: CompClassRow[] };

// The comp class messages sent for a class date, with each student's answer, so
// staff can see who has confirmed.
export async function compClassesSent(dateStr: string): Promise<CompClassSent[]> {
  const date = parseDateOnly(dateStr);
  const notices = await prisma.notice.findMany({ where: { type: "COMP_CLASS", date, sentAt: { not: null } }, orderBy: { createdAt: "asc" } });
  if (notices.length === 0) return [];

  const messages = await prisma.whatsAppMessage.findMany({
    where: { noticeId: { in: notices.map((n) => n.id) }, kind: "NOTICE", studentId: { not: null } },
    select: { noticeId: true, studentId: true, phone: true, status: true, dedupeKey: true },
  });
  const studentIds = Array.from(new Set(messages.map((m) => m.studentId!)));
  const [students, confirmations, batches] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } }),
    prisma.classConfirmation.findMany({ where: { date, kind: "COMP", studentId: { in: studentIds } } }),
    prisma.batch.findMany({ where: { id: { in: notices.flatMap((n) => n.batchIds) } }, select: { id: true, course: { select: { name: true } } } }),
  ]);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const courseOf = new Map(batches.map((b) => [b.id, b.course.name]));
  const answerOf = new Map(confirmations.map((c) => [`${c.studentId}|${c.batchId}`, c]));

  return notices.map((n) => {
    // One row per student and class; the batch is the third part of the message key "notice:<id>:<student>:<batch>:<phone>".
    const byClass = new Map<string, typeof messages>();
    for (const m of messages.filter((m) => m.noticeId === n.id)) {
      const batchId = m.dedupeKey.split(":")[3];
      byClass.set(`${m.studentId}|${batchId}`, [...(byClass.get(`${m.studentId}|${batchId}`) ?? []), m]);
    }
    const rows = Array.from(byClass.entries())
      .map(([key, msgs]): CompClassRow => {
        const studentId = msgs[0].studentId!;
        const c = answerOf.get(key);
        const delivered = msgs.some((m) => m.status !== "FAILED");
        return {
          studentId,
          studentName: nameOf.get(studentId) ?? "Student",
          courseName: courseOf.get(key.split("|")[1]) ?? "",
          phones: msgs.map((m) => m.phone),
          status: !delivered ? "FAILED" : replyStatus({ sent: true, answer: c?.answer ?? null, change: null })!,
          answeredAt: c?.answeredAt ?? null,
        };
      })
      .sort((a, b) => a.courseName.localeCompare(b.courseName) || a.studentName.localeCompare(b.studentName));
    return { noticeId: n.id, time: n.newStartTime ?? "", sentAt: n.sentAt, rows };
  });
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

// A tap-to-choose list inside the 24 hours after the family tapped a button.
export async function sendListReply(phone: string, body: string, rows: ListRow[], key: string) {
  try {
    const row = await prisma.whatsAppMessage.create({
      data: { kind: "REPLY", phone, template: "interactive", body, summary: `Slot list (${rows.length - 1} options)`, dedupeKey: `reply:${key}` },
    });
    const result = await sendList(phone, body, rows);
    await prisma.whatsAppMessage.update({
      where: { id: row.id },
      data: result.ok
        ? { status: result.dryRun ? "DRY_RUN" : "SENT", waMessageId: result.id, sentAt: new Date() }
        : { status: "FAILED", error: result.error },
    });
  } catch (e) {
    console.warn("[whatsapp] list not sent:", e instanceof Error ? e.message : e);
  }
}

// Asks a question answered by tapping up to 3 buttons, inside the 24 hours
// after the family last wrote to us.
export async function sendButtonsReply(phone: string, body: string, buttons: { id: string; title: string }[], key: string) {
  try {
    const row = await prisma.whatsAppMessage.create({
      data: { kind: "REPLY", phone, template: "interactive", body, summary: body.slice(0, 80), dedupeKey: `reply:${key}` },
    });
    const result = await sendButtons(phone, body, buttons);
    await prisma.whatsAppMessage.update({
      where: { id: row.id },
      data: result.ok
        ? { status: result.dryRun ? "DRY_RUN" : "SENT", waMessageId: result.id, sentAt: new Date() }
        : { status: "FAILED", error: result.error },
    });
  } catch (e) {
    console.warn("[whatsapp] buttons not sent:", e instanceof Error ? e.message : e);
  }
}

// Tells the family about a make-up class staff booked for them, with the
// approved "class rescheduled" message, to each number that has agreed to
// WhatsApp. Returns how many went out (0 when nobody has agreed or it isn't a
// make-up).
export async function notifyClassChange(changeId: string): Promise<number> {
  const change = await prisma.classChange.findUnique({
    where: { id: changeId },
    include: { student: { include: { guardians: { include: { user: { select: { phone: true } } } } } }, course: true, fromBatch: true, toBatch: true },
  });
  if (!change || change.status !== "BOOKED" || change.kind !== "MOVE" || !change.toBatch || !change.toDate || !whatsappConfigured()) return 0;

  const phones = recipientPhones(change.student.guardians.map((g) => g.user.phone), change.student.phone);
  const agreed = new Set((await prisma.whatsAppContact.findMany({ where: { phone: { in: phones }, optedIn: true, blockedAt: null }, select: { phone: true } })).map((c) => c.phone));
  let sent = 0;
  for (const phone of phones.filter((p) => agreed.has(p))) {
    const outcome = await sendLogged({
      kind: "NOTICE",
      phone,
      studentId: change.studentId,
      template: TEMPLATE_RESCHEDULED,
      params: [
        change.student.name,
        change.course.name,
        `${shortDateLabel(change.fromDate)} ${clockLabel(change.fromBatch.startTime)}`,
        `${shortDateLabel(change.toDate)} ${clockLabel(change.toBatch.startTime)}`,
      ],
      summary: `Make-up ${change.course.name} ${shortDateLabel(change.toDate)} ${clockLabel(change.toBatch.startTime)} · ${change.student.name}`,
      dedupeKey: `change:${change.id}:${phone}`,
    });
    if (outcome === "sent") sent++;
  }
  return sent;
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
    where "lastInboundAt" is not null and "blockedAt" is null and ("lastReadAt" is null or "lastReadAt" < "lastInboundAt")`;
  return Number(rows[0]?.n ?? 0);
}

// A free-text reply from staff, allowed only inside WhatsApp's 24-hour window.
export async function sendConversationReply(phone: string, rawText: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = cleanReplyText(rawText);
  if (!text) return { ok: false, error: "Write a message first." };
  const contact = await prisma.whatsAppContact.findUnique({ where: { phone }, select: { lastInboundAt: true, blockedAt: true } });
  if (contact?.blockedAt) return { ok: false, error: "This number is blocked." };
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
  const contacts = await prisma.whatsAppContact.findMany({ where: { lastInboundAt: { not: null }, blockedAt: null }, orderBy: { lastInboundAt: "desc" }, take: limit });
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

// ---- spam / blocking ------------------------------------------------------

export async function isBlocked(phone: string): Promise<boolean> {
  const c = await prisma.whatsAppContact.findUnique({ where: { phone }, select: { blockedAt: true } });
  return !!c?.blockedAt;
}

// Marks a number as spam: blocks it on WhatsApp (which only works for someone
// who messaged us in the last 24 hours) and, either way, ignores it from now
// on and never messages it. Returns a warning if WhatsApp itself refused.
export async function blockNumber(phone: string): Promise<{ whatsappBlocked: boolean; warning: string | null }> {
  const result = await setWhatsAppBlock(phone, true);
  const now = new Date();
  await prisma.whatsAppContact.upsert({
    where: { phone },
    create: { phone, blockedAt: now, lastReadAt: now },
    update: { blockedAt: now, lastReadAt: now, optedIn: false, optedOutAt: now },
  });
  return { whatsappBlocked: result.ok, warning: result.ok ? null : result.error };
}

export async function unblockNumber(phone: string): Promise<{ warning: string | null }> {
  const result = await setWhatsAppBlock(phone, false);
  await prisma.whatsAppContact.updateMany({ where: { phone }, data: { blockedAt: null } });
  return { warning: result.ok ? null : result.error };
}

export async function listBlocked() {
  return prisma.whatsAppContact.findMany({ where: { blockedAt: { not: null } }, orderBy: { blockedAt: "desc" }, select: { phone: true, name: true, blockedAt: true } });
}
