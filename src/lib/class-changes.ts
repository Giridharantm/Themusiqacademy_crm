import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import { dayCodeFromDate } from "@/lib/schedule";
import { istDateString } from "@/lib/whatsapp-notices";
import { COMP_WORKING_DAYS, addWorkingDays, changeOutcome, dateKey, isWorkingDay, makeUpDeadline, seatLimit, slotOptions, type SlotOption } from "@/lib/reschedule";

type Db = Prisma.TransactionClient | typeof prisma;

// Today's date (India) and the minutes since midnight there — slots that have
// already started today are never offered.
export function istToday(now = new Date()) {
  const today = parseDateOnly(istDateString(now));
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { today, nowMinutes: hour * 60 + minute };
}

// How many seats are taken in one class on one date: the regular roster, less
// anyone who moved away or is skipping that day, plus anyone making up a class
// there. `ignoreChangeId` leaves one booking out, for re-booking it.
export async function seatsTakenByDate(db: Db, batchIds: string[], dates: Date[], ignoreChangeId?: string) {
  const taken = new Map<string, number>();
  if (batchIds.length === 0 || dates.length === 0) return taken;
  const key = (batchId: string, date: Date) => `${batchId}|${dateKey(date)}`;

  const [enrolled, away, coming] = await Promise.all([
    db.enrollment.groupBy({ by: ["batchId"], where: { batchId: { in: batchIds }, status: "ACTIVE", student: { status: "ACTIVE" } }, _count: { _all: true } }),
    db.classChange.findMany({ where: { status: "BOOKED", fromBatchId: { in: batchIds }, fromDate: { in: dates }, id: { not: ignoreChangeId } }, select: { fromBatchId: true, fromDate: true } }),
    db.classChange.findMany({ where: { status: "BOOKED", kind: "MOVE", toBatchId: { in: batchIds }, toDate: { in: dates }, id: { not: ignoreChangeId } }, select: { toBatchId: true, toDate: true } }),
  ]);

  const regular = new Map(enrolled.map((e) => [e.batchId, e._count._all]));
  for (const batchId of batchIds) for (const date of dates) taken.set(key(batchId, date), regular.get(batchId) ?? 0);
  for (const c of away) taken.set(key(c.fromBatchId, c.fromDate), (taken.get(key(c.fromBatchId, c.fromDate)) ?? 0) - 1);
  for (const c of coming) taken.set(key(c.toBatchId!, c.toDate!), (taken.get(key(c.toBatchId!, c.toDate!)) ?? 0) + 1);
  return taken;
}

// The slots this student may make up a missed class in. Null when the class
// being missed isn't one of theirs.
export async function slotOptionsFor(studentId: string, fromBatchId: string, fromDate: Date, now = new Date(), db: Db = prisma): Promise<SlotOption[] | null> {
  const fromBatch = await db.batch.findUnique({ where: { id: fromBatchId }, include: { course: true } });
  if (!fromBatch || fromBatch.dayOfWeek !== dayCodeFromDate(fromDate)) return null;
  const mine = await db.enrollment.findFirst({ where: { studentId, batchId: fromBatchId, status: "ACTIVE" } });
  if (!mine) return null;

  const { today, nowMinutes } = istToday(now);
  const course = fromBatch.course;
  const batches = await db.batch.findMany({ where: { courseId: course.id } });
  const existing = await db.classChange.findFirst({ where: { studentId, fromBatchId, fromDate, status: "BOOKED" } });

  const last = course.canMoveDay ? addWorkingDays(fromDate, COMP_WORKING_DAYS) : fromDate;
  const dates: Date[] = [];
  for (let d = new Date(today); d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) if (isWorkingDay(d)) dates.push(d);

  const [taken, myEnrollments, myChanges] = await Promise.all([
    seatsTakenByDate(db, batches.map((b) => b.id), dates, existing?.id),
    db.enrollment.findMany({ where: { studentId, status: "ACTIVE", batch: { courseId: course.id } }, include: { batch: true } }),
    db.classChange.findMany({ where: { studentId, courseId: course.id, status: "BOOKED", id: { not: existing?.id } } }),
  ]);

  const awayKeys = new Set(myChanges.map((c) => `${c.fromBatchId}|${dateKey(c.fromDate)}`));
  const comingKeys = new Set(myChanges.filter((c) => c.kind === "MOVE" && c.toDate).map((c) => dateKey(c.toDate!)));
  const fromKey = dateKey(fromDate);

  // A day is taken if they already have a regular class of this instrument on
  // it (other than the one being missed) that they haven't moved away from, or
  // are already making a class up on it.
  const studentBusyOn = (date: Date) => {
    const key = dateKey(date);
    if (comingKeys.has(key)) return true;
    return myEnrollments.some(
      (e) => e.batch.dayOfWeek === dayCodeFromDate(date) && !(e.batchId === fromBatchId && key === fromKey) && !awayKeys.has(`${e.batchId}|${key}`)
    );
  };

  return slotOptions({
    course,
    batches,
    from: { batchId: fromBatchId, date: fromDate },
    today,
    nowMinutes,
    seatsTaken: (batchId, date) => taken.get(`${batchId}|${dateKey(date)}`) ?? 0,
    studentBusyOn,
  });
}

export type BookInput = {
  studentId: string;
  fromBatchId: string;
  fromDate: string; // yyyy-mm-dd
  to?: { batchId: string; date: string } | null; // omit to skip with no new slot
  source: "front-desk" | "admin" | "whatsapp";
  note?: string | null;
  createdById?: string | null;
};

export type BookResult = { ok: true; changeId: string } | { ok: false; error: string };

// Records a skipped class or a make-up class. A make-up is only accepted if the
// slot is still among the student's options (so the same rules and seat limits
// apply however it arrives), and any earlier booking for the same missed class
// is replaced. The original class's reminder is skipped for that date.
export async function bookClassChange(input: BookInput, now = new Date()): Promise<BookResult> {
  const fromDate = parseDateOnly(input.fromDate);
  const { today } = istToday(now);
  // A class already missed can still be made up (inside the window), but there
  // is nothing to skip once its day has gone.
  if (!input.to && fromDate < today) return { ok: false, error: "That class date has already passed" };

  return prisma.$transaction(async (tx) => {
    const options = await slotOptionsFor(input.studentId, input.fromBatchId, fromDate, now, tx);
    if (options === null) return { ok: false as const, error: "That isn't one of this student's classes on that date" };

    const batch = await tx.batch.findUniqueOrThrow({ where: { id: input.fromBatchId }, select: { courseId: true } });
    let toBatchId: string | null = null;
    let toDate: Date | null = null;

    if (input.to) {
      toDate = parseDateOnly(input.to.date);
      toBatchId = input.to.batchId;
      const open = options.find((o) => o.batchId === toBatchId && o.dateKey === dateKey(toDate!));
      if (!open) return { ok: false as const, error: "That slot isn't available (full, not allowed for this instrument, or outside the 5 working days)" };
    }

    await tx.classChange.updateMany({ where: { studentId: input.studentId, fromBatchId: input.fromBatchId, fromDate, status: "BOOKED" }, data: { status: "CANCELLED" } });
    const change = await tx.classChange.create({
      data: {
        studentId: input.studentId,
        courseId: batch.courseId,
        fromBatchId: input.fromBatchId,
        fromDate,
        toBatchId,
        toDate,
        kind: toBatchId ? "MOVE" : "SKIP",
        source: input.source,
        note: input.note?.trim() || null,
        createdById: input.createdById ?? null,
      },
    });
    await tx.reminderSkip.upsert({ where: { studentId_date: { studentId: input.studentId, date: fromDate } }, update: {}, create: { studentId: input.studentId, date: fromDate } });
    return { ok: true as const, changeId: change.id };
  });
}

export async function cancelClassChange(changeId: string): Promise<void> {
  const change = await prisma.classChange.findUnique({ where: { id: changeId } });
  if (!change || change.status !== "BOOKED") return;
  await prisma.$transaction([
    prisma.classChange.update({ where: { id: changeId }, data: { status: "CANCELLED" } }),
    prisma.reminderSkip.deleteMany({ where: { studentId: change.studentId, date: change.fromDate } }),
  ]);
}

// Seats for a set of classes on one date, for the batches page and rosters.
export async function seatSummary(batches: { id: string; maxStudents: number | null; course: { maxStudents: number | null } }[], date: Date) {
  const taken = await seatsTakenByDate(prisma, batches.map((b) => b.id), [date]);
  return new Map(batches.map((b) => [b.id, { taken: taken.get(`${b.id}|${dateKey(date)}`) ?? 0, limit: seatLimit(b, b.course) }]));
}

// Booked or past changes with where each one stands today (owed, booked,
// attended, didn't come, expired), for the tracking views. A make-up counts as
// attended when attendance was marked for that student, instrument and date.
export async function loadTracked(where: Prisma.ClassChangeWhereInput, now = new Date()) {
  const { today } = istToday(now);
  const changes = await prisma.classChange.findMany({
    where,
    include: { student: true, course: true, fromBatch: true, toBatch: true },
    orderBy: { createdAt: "asc" },
  });
  const moves = changes.filter((c) => c.kind === "MOVE" && c.status === "BOOKED" && c.toDate);
  const present = moves.length
    ? await prisma.attendance.findMany({
        where: { status: "PRESENT", OR: moves.map((c) => ({ studentId: c.studentId, courseId: c.courseId, date: c.toDate! })) },
        select: { studentId: true, courseId: true, date: true },
      })
    : [];
  const attended = new Set(present.map((a) => `${a.studentId}|${a.courseId}|${dateKey(a.date)}`));
  return changes.map((c) => ({
    ...c,
    deadline: makeUpDeadline(c.course.canMoveDay, c.fromDate),
    outcome: changeOutcome(
      { kind: c.kind, status: c.status, fromDate: c.fromDate, toDate: c.toDate, canMoveDay: c.course.canMoveDay },
      today,
      !!c.toDate && attended.has(`${c.studentId}|${c.courseId}|${dateKey(c.toDate)}`)
    ),
  }));
}
