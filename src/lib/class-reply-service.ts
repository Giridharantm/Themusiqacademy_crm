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
import { recipientPhones, shortDateLabel } from "@/lib/whatsapp-notices";
import { sendButtonsReply, sendListReply, sendReply } from "@/lib/whatsapp-service";

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
    case "move":
      await offerSlots(null);
      return true;
    case "cancel":
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
