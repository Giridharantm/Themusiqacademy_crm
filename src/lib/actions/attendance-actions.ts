"use server";

import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markBulkAttendance } from "@/lib/attendance";

// Marks attendance for every student in a class session (everyone enrolled
// in that instrument, plus any comp/reschedule students added for this
// session) in one submission — admin can do this for any instrument.
export async function markBulkAttendanceAsAdmin(courseId: string, dateStr: string, formData: FormData) {
  const user = await requireRole("ADMIN");
  const studentIds = await markBulkAttendance(courseId, dateStr, formData, user.id);

  revalidatePath("/admin/attendance");
  revalidatePath("/admin/students");
  for (const studentId of studentIds) {
    revalidatePath(`/admin/students/${studentId}`);
    revalidatePath(`/parent/students/${studentId}`);
  }

  // A plain revalidate leaves the roster's client component mounted with its
  // pre-save state (radios, comp list), so a successful save could look like
  // nothing happened. Redirecting back to the same class forces a real
  // navigation that remounts it with the confirmed, saved state.
  redirect(`/admin/attendance?courseId=${courseId}&date=${dateStr}`);
}
