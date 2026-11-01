// Handles a family's taps on the reminder's buttons and on the slot list: books
// the skip or make-up through the same rules staff use, and answers on
// WhatsApp. Only the numbers on file for that student are listened to.
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import { bookClassChange, slotOptionsFor } from "@/lib/class-changes";
import { ACADEMY_PHONE_LABEL, callUsText, confirmedText, parseReplyId, skippedText, slotRows, slotsBody } from "@/lib/class-reply";
import { recipientPhones } from "@/lib/whatsapp-notices";
import { sendListReply, sendReply } from "@/lib/whatsapp-service";

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

  switch (reply.kind) {
    case "cant": {
      const r = await book(null);
      if (!r.ok) {
        await say(`Sorry, we couldn't record that automatically. Please call us on ${ACADEMY_PHONE_LABEL}.`, 1);
        return true;
      }
      await offerSlots(`${skippedText(student.name, course, missed)} You can make this class up for free.`);
      return true;
    }
    case "move":
      await offerSlots(null);
      return true;
    case "nomove":
      await say(`No problem. If you'd like a make-up class later, reply here or call us on ${ACADEMY_PHONE_LABEL}.`, 1);
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
