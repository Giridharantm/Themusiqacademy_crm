"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";

export async function createCourse(formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const durationMinutes = Number(formData.get("durationMinutes") ?? 60);

  if (!name) throw new Error("Name is required");

  await prisma.course.create({
    data: { name, description, durationMinutes },
  });

  revalidatePath("/admin/courses");
}

// The instrument's seat limit (blank = no limit) and whether a missed class may
// be made up on another day or only at another time the same day.
export async function updateCourseRules(courseId: string, formData: FormData) {
  await requireRole("ADMIN");

  const raw = String(formData.get("maxStudents") ?? "").trim();
  const maxStudents = raw === "" ? null : Math.floor(Number(raw));
  if (maxStudents !== null && (!Number.isFinite(maxStudents) || maxStudents < 1)) throw new Error("The limit must be a number of 1 or more, or blank for no limit");
  const canMoveDay = formData.get("canMoveDay") === "on";

  await prisma.course.update({ where: { id: courseId }, data: { maxStudents, canMoveDay } });
  revalidatePath("/admin/courses");
  revalidatePath("/admin/batches");
}

export async function deleteCourse(courseId: string) {
  await requireRole("ADMIN");

  const [batches, subscriptions, attendance, leads] = await Promise.all([
    prisma.batch.count({ where: { courseId } }),
    prisma.subscription.count({ where: { courseId } }),
    prisma.attendance.count({ where: { courseId } }),
    prisma.lead.count({ where: { interestedCourseId: courseId } }),
  ]);

  const blockers = [
    batches > 0 && `${batches} batch${batches !== 1 ? "es" : ""}`,
    subscriptions > 0 && `${subscriptions} subscription${subscriptions !== 1 ? "s" : ""}`,
    attendance > 0 && `${attendance} attendance record${attendance !== 1 ? "s" : ""}`,
    leads > 0 && `${leads} lead${leads !== 1 ? "s" : ""} interested in it`,
  ].filter(Boolean);

  if (blockers.length > 0) {
    throw new Error(`Can't delete this course — it still has ${blockers.join(", ")}. Remove those first.`);
  }

  await prisma.course.delete({ where: { id: courseId } });
  revalidatePath("/admin/courses");
}
