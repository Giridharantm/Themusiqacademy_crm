// Handles a family's taps on the reminder's buttons and on the slot list: books
// the skip or make-up through the same rules staff use, and answers on
// WhatsApp. Only the numbers on file for that student are listened to.
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import { bookClassChange, slotOptionsFor } from "@/lib/class-changes";
import {
  ACADEMY_PHONE_LABEL,
  REPLY_BUTTON_CANCEL,
  REPLY_BUTTON_RESCHEDULE,
  attendingText,
  autoSkipDue,
  autoSkippedText,
  compAttendingText,
  compDeclinedText,
  callUsText,
  confirmedText,
  parseReplyId,
  replyId,
  skippedText,
  slotRows,
  slotsBody,
  whatNextText,
} from "@/lib/class-reply";
import { makeUpDeadline } from "@/lib/reschedule";
import { istDateString, istMinutes, recipientPhones, shortDateLabel } from "@/lib/whatsapp-notices";
import { getAutoSkipNo, getRemindersPaused, sendButtonsReply, sendListReply, sendReply } from "@/lib/whatsapp-service";

export type AutoSkipRun = { skipped: number; reason?: string };

// A family that tapped No and then never chose Reschedule or Cancel leaves the
// seat held. Once the class has started that No is turned into a recorded skip
// (the same one "Can't attend" makes), the family is told, and offered a
// Reschedule button. Only within AUTO_SKIP_WINDOW_MINUTES of the start. Left alone: anyone with a booking for that class already
// (even a cancelled one, so staff undoing it is respected) and anyone marked
// present. Does nothing while reminders are paused or the switch is off.
export async function autoSkipUnansweredNos(now = new Date()): Promise<AutoSkipRun> {
  if (!(await getAutoSkipNo())) return { skipped: 0, reason: "Auto-skip is off" };
  if ((await getRemindersPaused()).paused) return { skipped: 0, reason: "Reminders are paused" };

  const dateStr = istDateString(now);
  const date = parseDateOnly(dateStr);
  const nos = await prisma.classConfirmation.findMany({ where: { date, kind: "REGULAR", answer: "NO", student: { status: "ACTIVE" } } });
  if (nos.length === 0) return { skipped: 0 };

  const studentIds = nos.map((n) => n.studentId);
  const [batches, changes, present] = await Promise.all([
    prisma.batch.findMany({ where: { id: { in: nos.map((n) => n.batchId) } }, include: { course: true } }),
    prisma.classChange.findMany({ where: { fromDate: date, studentId: { in: studentIds } }, select: { studentId: true, fromBatchId: true } }),
    prisma.attendance.findMany({ where: { date, status: "PRESENT", studentId: { in: studentIds } }, select: { studentId: true, courseId: true } }),
  ]);
  const batchOf = new Map(batches.map((b) => [b.id, b]));
  const handled = new Set(changes.map((c) => `${c.studentId}|${c.fromBatchId}`));
  const came = new Set(present.map((a) => `${a.studentId}|${a.courseId}`));

  let skipped = 0;
  for (const n of nos) {
    const batch = batchOf.get(n.batchId);
    if (!batch || !autoSkipDue(batch.startTime, istMinutes(now))) continue;
    if (handled.has(`${n.studentId}|${n.batchId}`) || came.has(`${n.studentId}|${batch.courseId}`)) continue;

    const r = await bookClassChange(
      { studentId: n.studentId, fromBatchId: n.batchId, fromDate: dateStr, to: null, source: "whatsapp", note: "Said no on WhatsApp and didn't choose a make-up; marked as missed when the class started" },
      now
    );
    if (!r.ok) continue;
    skipped++;

    const student = await prisma.student.findUnique({ where: { id: n.studentId }, select: { name: true } });
    const missed = { date, startTime: batch.startTime };
    const text = autoSkippedText(student?.name ?? "your child", batch.course.name, missed, batch.course.canMoveDay ? makeUpDeadline(true, date) : null);
    const key = `autoskip:${dateStr}:${n.studentId}:${n.batchId}`;
    if (batch.course.canMoveDay) {
      await sendButtonsReply(n.phone, text, [{ id: replyId({ kind: "move", studentId: n.studentId, batchId: n.batchId, date: dateStr }), title: REPLY_BUTTON_RESCHEDULE }], key);
    } else {
      await sendReply(n.phone, text, key);
    }
  }
  return { skipped };
}

// Remembers a family's Yes / No so staff can see who has confirmed. The latest tap wins.
async function recordConfirmation(studentId: string, batchId: string, dateStr: string, kind: "REGULAR" | "COMP", answer: "YES" | "NO", phone: string) {
  const key = { studentId, batchId, date: parseDateOnly(dateStr), kind };
  await prisma.classConfirmation.upsert({
    where: { studentId_batchId_date_kind: key },
    create: { ...key, answer, phone },
    update: { answer, phone, answeredAt: new Date() },
  });
}

// Returns true when the tap was ours to handle (so the webhook stops there).
export async function handleClassReply(phone: string, msgId: string, id: string): Promise<boolean> {
  const reply = parseReplyId(id);
  if (!reply) return false;

  const student = await prisma.student.findUnique({ where: { id: reply.studentId }, include: { guardians: { include: { user: { select: { phone: true } } } } } });
  const batch = await prisma.batch.findUnique({ where: { id: reply.batchId }, include: { course: true } });
  if (!student || !batch) return false;
  if (!recipientPhones(student.guardians.map((g) => g.user.phone), student.phone).includes(phone)) return false;

  const say = (text: string, n: number) => sendReply(phone, text, `${msgId}:${n}`);
  const missed = { date: parseDateOnly(reply.date), startTime: batch.startTime };
  const course = batch.course.name;

  const offerSlots = async (intro: string | null) => {
    const options = await slotOptionsFor(student.id, batch.id, missed.date);
    if (!options || options.length === 0) {
      await say(callUsText(intro ?? "Thank you for letting us know."), 2);
      return;
    }
    if (intro) await say(intro, 2);
    await sendListReply(phone, slotsBody(student.name, course, missed), slotRows({ studentId: student.id, batchId: batch.id, date: reply.date }, options, course), `${msgId}:3`);
  };

  const book = (to: { batchId: string; date: string } | null) =>
    bookClassChange({ studentId: student.id, fromBatchId: batch.id, fromDate: reply.date, to, source: "whatsapp", note: "Booked by the family on WhatsApp" });

  // Records the class as skipped and says what is still owed.
  const skip = async () => {
    const r = await book(null);
    if (!r.ok) {
      await say(`Sorry, we couldn't record that automatically. Please call us on ${ACADEMY_PHONE_LABEL}.`, 1);
      return;
    }
    const until = makeUpDeadline(batch.course.canMoveDay, missed.date);
    const owed = batch.course.canMoveDay
      ? ` You can still make this class up for free until ${shortDateLabel(until)}. Message us here or call ${ACADEMY_PHONE_LABEL} to pick a slot.`
      : "";
    await say(`${skippedText(student.name, course, missed)}${owed}`, 1);
  };

  switch (reply.kind) {
    case "yes":
      await recordConfirmation(student.id, batch.id, reply.date, "REGULAR", "YES", phone);
      await say(attendingText(student.name, batch.startTime), 1);
      return true;
    case "cyes": {
      await recordConfirmation(student.id, batch.id, reply.date, "COMP", "YES", phone);
      const notice = await prisma.notice.findFirst({ where: { type: "COMP_CLASS", date: missed.date, batchIds: { has: batch.id } }, orderBy: { createdAt: "desc" }, select: { newStartTime: true } });
      await say(compAttendingText(notice?.newStartTime ?? null), 1);
      return true;
    }
    case "cno":
      await recordConfirmation(student.id, batch.id, reply.date, "COMP", "NO", phone);
      await say(compDeclinedText(student.name), 1);
      return true;
    case "no":
      await recordConfirmation(student.id, batch.id, reply.date, "REGULAR", "NO", phone);
      await sendButtonsReply(
        phone,
        whatNextText(student.name, course, batch.startTime),
        [
          { id: replyId({ kind: "move", studentId: student.id, batchId: batch.id, date: reply.date }), title: REPLY_BUTTON_RESCHEDULE },
          { id: replyId({ kind: "cancel", studentId: student.id, batchId: batch.id, date: reply.date }), title: REPLY_BUTTON_CANCEL },
        ],
        `${msgId}:1`
      );
      return true;
    // On the three-button reminder these two are the family's first answer, so
    // they count as a No (staff see them as not coming) even if no slot is picked.
    case "move":
      await recordConfirmation(student.id, batch.id, reply.date, "REGULAR", "NO", phone);
      await offerSlots(null);
      return true;
    case "cancel":
      await recordConfirmation(student.id, batch.id, reply.date, "REGULAR", "NO", phone);
      await skip();
      return true;
    case "nomove":
      await skip();
      return true;
    case "slot": {
      const r = await book({ batchId: reply.toBatchId, date: reply.toDate });
      if (!r.ok) {
        await offerSlots("Sorry, that slot has just been taken or isn't available any more.");
        return true;
      }
      const slot = await prisma.batch.findUnique({ where: { id: reply.toBatchId }, select: { startTime: true } });
      await say(confirmedText(student.name, course, { date: parseDateOnly(reply.toDate), startTime: slot?.startTime ?? batch.startTime }), 1);
      return true;
    }
  }
}
