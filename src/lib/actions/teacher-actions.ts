"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markBulkAttendance } from "@/lib/attendance";

// Marks attendance for every student in a class session (everyone enrolled
// in that instrument, plus any comp/reschedule students added for this
// session) in one submission — restricted to instruments this teacher
// actually teaches (has at least one batch of).
export async function markBulkAttendanceAsTeacher(courseId: string, dateStr: string, formData: FormData) {
  const user = await requireRole("TEACHER");

  const teaches = await prisma.batch.findFirst({ where: { teacherId: user.id, courseId } });
  if (!teaches) throw new Error("Not authorized for this instrument");

  const studentIds = await markBulkAttendance(courseId, dateStr, formData, user.id);

  revalidatePath("/teacher/attendance");
  for (const studentId of studentIds) {
    revalidatePath(`/teacher/students/${studentId}`);
    revalidatePath(`/parent/students/${studentId}`);
  }

  // A plain revalidate leaves the roster's client component mounted with its
  // pre-save state (radios, comp list), so a successful save could look like
  // nothing happened. Redirecting back to the same class forces a real
  // navigation that remounts it with the confirmed, saved state.
  redirect(`/teacher/attendance?courseId=${courseId}&date=${dateStr}`);
}

export async function createHomework(batchId: string, formData: FormData) {
  const user = await requireRole("TEACHER");

  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.teacherId !== user.id) throw new Error("Not authorized for this batch");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const dueDateRaw = String(formData.get("dueDate") ?? "");

  if (!title) throw new Error("Title is required");

  await prisma.homework.create({
    data: {
      batchId,
      teacherId: user.id,
      title,
      description,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
    },
  });

  revalidatePath(`/teacher/batches/${batchId}`);
}

export async function addFeedback(studentId: string, formData: FormData) {
  const user = await requireRole("TEACHER");

  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("Feedback note is required");

  await prisma.feedback.create({
    data: { studentId, teacherId: user.id, note },
  });

  revalidatePath(`/teacher/students/${studentId}`);
}
