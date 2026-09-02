"use server";

import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { markStudentPresent, unmarkStudentAttendance } from "@/lib/attendance";

function revalidateAttendance(studentId: string) {
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath(`/parent/students/${studentId}`);
}

export async function markStudentPresentAsAdmin(studentId: string, courseId: string, dateStr: string) {
  const user = await requireRole("ADMIN");
  await markStudentPresent(studentId, courseId, dateStr, user.id);
  revalidateAttendance(studentId);
}

export async function unmarkStudentAsAdmin(studentId: string, courseId: string, dateStr: string) {
  await requireRole("ADMIN");
  await unmarkStudentAttendance(studentId, courseId, dateStr);
  revalidateAttendance(studentId);
}

// From a student's own page: mark/remove attendance for a date the admin
// picks directly, rather than going through the day's whole class roster —
// useful for backfilling a missed mark or correcting a specific date.
export async function markAttendanceOnDateAsAdmin(studentId: string, courseId: string, formData: FormData) {
  const user = await requireRole("ADMIN");
  const dateStr = String(formData.get("date") ?? "");
  await markStudentPresent(studentId, courseId, dateStr, user.id);
  revalidateAttendance(studentId);
}

export async function removeAttendanceOnDateAsAdmin(studentId: string, courseId: string, formData: FormData) {
  await requireRole("ADMIN");
  const dateStr = String(formData.get("date") ?? "");
  await unmarkStudentAttendance(studentId, courseId, dateStr);
  revalidateAttendance(studentId);
}
