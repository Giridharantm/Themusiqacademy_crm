"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { createAndSendNotice, setConsent } from "@/lib/whatsapp-service";
import { isNoticeType, normalizePhone } from "@/lib/whatsapp-notices";

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
    createdById: user.id,
  });

  revalidatePath("/admin/whatsapp");
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
