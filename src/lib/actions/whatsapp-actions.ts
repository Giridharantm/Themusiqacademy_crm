"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import { blockNumber, createAndSendNotice, markConversationRead, sendConversationReply, sendRemindersNow, setAutoSkipNo, setConsent, setReminderStyle, setReminderTime, setRemindersPaused, unblockNumber, type ReminderStyle } from "@/lib/whatsapp-service";
import { isNoticeType, isReminderTime, normalizePhone } from "@/lib/whatsapp-notices";

// Sends an ad hoc notice to the opted-in families of the chosen classes. The
// form that posts here is the confirmation step after a recipient preview.
export async function sendNotice(formData: FormData) {
  const user = await requireRole("ADMIN");

  const type = String(formData.get("type") ?? "");
  if (!isNoticeType(type)) throw new Error("Choose what kind of notice this is");

  const result = await createAndSendNotice({
    type,
    dateStr: String(formData.get("date") ?? ""),
    batchIds: formData.getAll("batchId").map(String).filter(Boolean),
    message: String(formData.get("message") ?? ""),
    newDateStr: String(formData.get("newDate") ?? "") || undefined,
    newStartTime: String(formData.get("newTime") ?? "") || undefined,
    // A comp class goes only to the students ticked on the preview.
    picks: type === "COMP_CLASS" ? formData.getAll("pick").map(String).filter(Boolean) : undefined,
    createdById: user.id,
  });

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/reminders");
  // A comp class is followed up on the Class reminders page, where who has confirmed is listed.
  if (type === "COMP_CLASS") {
    const comp = new URLSearchParams({ date: String(formData.get("date") ?? ""), compOk: String(result.sent), compFailed: String(result.failed) });
    redirect(`/admin/whatsapp/reminders?${comp.toString()}`);
  }
  const q = new URLSearchParams({
    sent: result.noticeId,
    ok: String(result.sent),
    failed: String(result.failed),
    skipped: String(result.noConsent),
  });
  redirect(`/admin/whatsapp?${q.toString()}`);
}

// An admin recording that a family agreed to WhatsApp class messages (in
// person, on a form) — or that they asked to stop.
export async function setPhoneConsent(studentId: string, phone: string, optedIn: boolean) {
  await requireRole("ADMIN");
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("That phone number is not valid");
  await setConsent(normalized, optedIn, "admin");
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/admin/whatsapp");
}

// Staff reply from the inbox. Free text goes out in the academy's name, and
// only inside WhatsApp's 24-hour reply window; the page re-renders with the
// reason if WhatsApp (or the window rule) refuses it.
export async function sendInboxReply(formData: FormData) {
  await requireRole("ADMIN", "FRONT_DESK");
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) throw new Error("That phone number is not valid");

  const result = await sendConversationReply(phone, String(formData.get("text") ?? ""));
  revalidatePath("/admin/whatsapp/inbox");
  const q = new URLSearchParams({ phone });
  if (!result.ok) q.set("error", result.error);
  redirect(`/admin/whatsapp/inbox?${q.toString()}`);
}

// Called when a conversation is opened, so the unread badge clears.
export async function markInboxRead(phone: string) {
  await requireRole("ADMIN", "FRONT_DESK");
  const normalized = normalizePhone(phone);
  if (!normalized) return;
  await markConversationRead(normalized);
  revalidatePath("/admin/whatsapp/inbox");
  revalidatePath("/admin");
}

// The master switch for the daily 10:00 reminder. Paused means the job sends
// nothing at all until it is resumed; notices and inbox replies are unaffected.
export async function setRemindersPausedAction(paused: boolean) {
  const user = await requireRole("ADMIN");
  await setRemindersPaused(paused, user.name ?? "an admin");
  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/reminders");
}

// The time of day the automatic reminder goes out.
export async function setReminderTimeAction(formData: FormData) {
  const user = await requireRole("ADMIN");
  const time = String(formData.get("time") ?? "");
  if (!isReminderTime(time)) throw new Error("Choose a time from the list");
  await setReminderTime(time, user.name ?? "an admin");
  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/reminders");
}

// "Send today's reminders now": for when the automatic run is off (paused) or
// didn't go out. Skips anyone already messaged today.
export async function sendRemindersNowAction() {
  await requireRole("ADMIN");
  const run = await sendRemindersNow();
  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/reminders");
  const q = new URLSearchParams(
    run.ran
      ? { sentNow: String(run.sent), failedNow: String(run.failed), alreadyNow: String(run.duplicate) }
      : { notSent: run.reason }
  );
  redirect(`/admin/whatsapp/reminders?${q.toString()}`);
}

// Chooses how the daily reminder is sent: plain, with Yes / No buttons, or with Yes /
// Reschedule / Can't attend. Only choose a button style once Meta has approved its templates.
export async function setReminderStyleAction(style: ReminderStyle) {
  const user = await requireRole("ADMIN");
  if (style !== "PLAIN" && style !== "YES_NO" && style !== "THREE") throw new Error("Unknown reminder style");
  await setReminderStyle(style, user.name ?? "an admin");
  revalidatePath("/admin/whatsapp/reminders");
}

// Whether a No that was never followed up is marked as a missed class once the class starts.
export async function setAutoSkipNoAction(on: boolean) {
  await requireRole("ADMIN");
  await setAutoSkipNo(on);
  revalidatePath("/admin/whatsapp/reminders");
}

// Skip (or un-skip) one student's reminder for one class date only.
export async function toggleReminderSkip(studentId: string, dateStr: string) {
  await requireRole("ADMIN");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("That date is not valid");
  const date = parseDateOnly(dateStr);
  const existing = await prisma.reminderSkip.findUnique({ where: { studentId_date: { studentId, date } } });
  if (existing) await prisma.reminderSkip.delete({ where: { id: existing.id } });
  else await prisma.reminderSkip.create({ data: { studentId, date } });
  revalidatePath("/admin/whatsapp/reminders");
}

// Turn the daily reminder off (or back on) for a student for good.
export async function setStudentRemindersOff(studentId: string, off: boolean) {
  await requireRole("ADMIN");
  await prisma.student.update({ where: { id: studentId }, data: { remindersOff: off } });
  revalidatePath("/admin/whatsapp/reminders");
  revalidatePath(`/admin/students/${studentId}`);
}

// Marks a number as spam from the inbox: blocks it on WhatsApp, hides the
// conversation and ignores everything it sends from now on. The lead it may
// have created is left for staff to delete.
export async function markNumberAsSpam(phone: string) {
  await requireRole("ADMIN", "FRONT_DESK");
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("That phone number is not valid");
  const result = await blockNumber(normalized);
  revalidatePath("/admin/whatsapp/inbox");
  revalidatePath("/admin");
  const q = new URLSearchParams({ blocked: normalized });
  if (result.warning) q.set("warning", result.warning);
  redirect(`/admin/whatsapp/inbox?${q.toString()}`);
}

export async function unblockNumberAction(phone: string) {
  await requireRole("ADMIN", "FRONT_DESK");
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("That phone number is not valid");
  const result = await unblockNumber(normalized);
  revalidatePath("/admin/whatsapp/inbox");
  const q = new URLSearchParams({ unblocked: normalized });
  if (result.warning) q.set("warning", result.warning);
  redirect(`/admin/whatsapp/inbox?${q.toString()}`);
}
