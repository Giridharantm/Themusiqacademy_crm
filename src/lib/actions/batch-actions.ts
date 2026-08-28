"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { timeSlotsForDay, DAY_LABELS, formatTimeLabel } from "@/lib/schedule";

export async function createBatch(formData: FormData) {
  await requireRole("ADMIN");

  const courseId = String(formData.get("courseId") ?? "");
  const teacherId = String(formData.get("teacherId") ?? "") || null;
  const dayOfWeek = String(formData.get("dayOfWeek") ?? "");
  const timeSlot = String(formData.get("timeSlot") ?? "");
  const room = String(formData.get("room") ?? "").trim() || null;

  const [startTime, endTime] = timeSlot.split("|");

  if (!courseId || !dayOfWeek || !startTime || !endTime) {
    throw new Error("Course, day and a time slot are required");
  }

  const validSlots = timeSlotsForDay(dayOfWeek);
  if (!validSlots.some((s) => s.start === startTime && s.end === endTime)) {
    throw new Error("That time slot isn't valid for the selected day. Monday is a holiday; Tue-Fri runs 3pm-9pm, Saturday 2pm-8pm, Sunday 11am-5pm, in 1-hour batches.");
  }

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new Error("Course not found");

  const name = `${course.name} - ${DAY_LABELS[dayOfWeek]} - ${formatTimeLabel(startTime)}`;

  await prisma.batch.create({
    data: { name, courseId, teacherId, dayOfWeek, startTime, endTime, room },
  });

  revalidatePath("/admin/batches");
}

// Changes an existing batch's teacher, day/time, or room — not its
// instrument, since that's what every enrollment and subscription pooled
// against it is keyed on. Need a different instrument entirely? Delete this
// batch and create a fresh one instead.
export async function updateBatch(batchId: string, formData: FormData) {
  await requireRole("ADMIN");

  const teacherId = String(formData.get("teacherId") ?? "") || null;
  const dayOfWeek = String(formData.get("dayOfWeek") ?? "");
  const timeSlot = String(formData.get("timeSlot") ?? "");
  const room = String(formData.get("room") ?? "").trim() || null;

  const [startTime, endTime] = timeSlot.split("|");

  if (!dayOfWeek || !startTime || !endTime) {
    throw new Error("Day and a time slot are required");
  }

  const validSlots = timeSlotsForDay(dayOfWeek);
  if (!validSlots.some((s) => s.start === startTime && s.end === endTime)) {
    throw new Error("That time slot isn't valid for the selected day. Monday is a holiday; Tue-Fri runs 3pm-9pm, Saturday 2pm-8pm, Sunday 11am-5pm, in 1-hour batches.");
  }

  const batch = await prisma.batch.findUnique({ where: { id: batchId }, include: { course: true } });
  if (!batch) throw new Error("Batch not found");

  const name = `${batch.course.name} - ${DAY_LABELS[dayOfWeek]} - ${formatTimeLabel(startTime)}`;

  await prisma.batch.update({
    where: { id: batchId },
    data: { name, teacherId, dayOfWeek, startTime, endTime, room },
  });

  revalidatePath("/admin/batches");
  revalidatePath(`/admin/batches/${batchId}`);
}

export async function deleteBatch(batchId: string) {
  await requireRole("ADMIN");

  const [enrollments, homework] = await Promise.all([
    prisma.enrollment.count({ where: { batchId } }),
    prisma.homework.count({ where: { batchId } }),
  ]);

  const blockers = [
    enrollments > 0 && `${enrollments} enrolled student${enrollments !== 1 ? "s" : ""}`,
    homework > 0 && `${homework} homework record${homework !== 1 ? "s" : ""}`,
  ].filter(Boolean);

  if (blockers.length > 0) {
    throw new Error(`Can't delete this batch — it still has ${blockers.join(" and ")}. Remove those first.`);
  }

  await prisma.batch.delete({ where: { id: batchId } });
  revalidatePath("/admin/batches");
}
