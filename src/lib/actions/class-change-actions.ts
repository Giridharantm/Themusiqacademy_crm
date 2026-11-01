"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { bookClassChange as book, cancelClassChange as cancel } from "@/lib/class-changes";

// Books a skipped class (no `toSlot`) or a make-up class. `toSlot` is
// "<batchId>|<yyyy-mm-dd>", chosen from the options the page offered; the same
// rules are checked again here, so an old page can't book a slot that has
// since filled up.
export async function bookClassChange(studentId: string, fromBatchId: string, fromDate: string, formData: FormData) {
  const user = await requireRole("ADMIN", "FRONT_DESK");
  const toSlot = String(formData.get("toSlot") ?? "");
  const [toBatchId, toDate] = toSlot.split("|");
  const note = String(formData.get("note") ?? "");

  const result = await book({
    studentId,
    fromBatchId,
    fromDate,
    to: toBatchId && toDate ? { batchId: toBatchId, date: toDate } : null,
    source: user.role === "ADMIN" ? "admin" : "front-desk",
    note,
    createdById: user.id,
  });

  revalidatePath("/admin/changes");
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/whatsapp/reminders");
  if (!result.ok) redirect(`/admin/changes?studentId=${studentId}&batchId=${fromBatchId}&date=${fromDate}&error=${encodeURIComponent(result.error)}`);
  redirect(`/admin/changes?on=${fromDate}&saved=1`);
}

export async function cancelClassChange(changeId: string, backDate: string) {
  await requireRole("ADMIN", "FRONT_DESK");
  await cancel(changeId);
  revalidatePath("/admin/changes");
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/whatsapp/reminders");
  redirect(`/admin/changes?on=${backDate}`);
}
