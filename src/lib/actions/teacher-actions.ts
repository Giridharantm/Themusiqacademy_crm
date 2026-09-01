"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { markStudentPresent, unmarkStudentAttendance } from "@/lib/attendance";

async function requireTeachesCourse(teacherId: string, courseId: string) {
  const teaches = await prisma.batch.findFirst({ where: { teacherId, courseId } });
  if (!teaches) throw new Error("Not authorized for this instrument");
}

function revalidateAttendance(studentId: string) {
  revalidatePath("/teacher/attendance");
  revalidatePath(`/teacher/students/${studentId}`);
  revalidatePath(`/parent/students/${studentId}`);
}

// Marks one student present for an instrument+date — restricted to
// instruments this teacher actually teaches (has at least one batch of).
export async function markStudentPresentAsTeacher(studentId: string, courseId: string, dateStr: string) {
  const user = await requireRole("TEACHER");
  await requireTeachesCourse(user.id, courseId);
  await markStudentPresent(studentId, courseId, dateStr, user.id);
  revalidateAttendance(studentId);
}

export async function unmarkStudentAsTeacher(studentId: string, courseId: string, dateStr: string) {
  const user = await requireRole("TEACHER");
  await requireTeachesCourse(user.id, courseId);
  await unmarkStudentAttendance(studentId, courseId, dateStr);
  revalidateAttendance(studentId);
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
