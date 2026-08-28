"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

export async function createTeacher(formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "").trim() || "password123";

  if (!name || !email) throw new Error("Name and email are required");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("A user with this email already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const teacher = await prisma.user.create({
    data: { name, email, phone, role: "TEACHER", passwordHash },
  });

  revalidatePath("/admin/teachers");
  return teacher.id;
}

export async function updateTeacher(teacherId: string, formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;

  if (!name || !email) throw new Error("Name and email are required");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== teacherId) throw new Error("A user with this email already exists");

  await prisma.user.update({
    where: { id: teacherId },
    data: { name, email, phone },
  });

  revalidatePath(`/admin/teachers/${teacherId}`);
  revalidatePath("/admin/teachers");
}

export async function updateTeacherStatus(teacherId: string, status: "ACTIVE" | "INACTIVE") {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: teacherId }, data: { status } });
  revalidatePath(`/admin/teachers/${teacherId}`);
  revalidatePath("/admin/teachers");
}

// Only removes the account outright when there's no history attached
// (no batches, homework, feedback or attendance markings) — otherwise that
// history would either block the delete (foreign keys) or silently lose its
// attribution. Reassign batches and deactivate instead for a teacher who's
// actually taught.
export async function deleteTeacher(teacherId: string) {
  await requireRole("ADMIN");

  const [batches, homework, feedback, attendance] = await Promise.all([
    prisma.batch.count({ where: { teacherId } }),
    prisma.homework.count({ where: { teacherId } }),
    prisma.feedback.count({ where: { teacherId } }),
    prisma.attendance.count({ where: { markedById: teacherId } }),
  ]);

  if (batches + homework + feedback + attendance > 0) {
    throw new Error("This teacher has batches or history attached — reassign their batches and deactivate the account instead of deleting it.");
  }

  await prisma.user.delete({ where: { id: teacherId } });
  revalidatePath("/admin/teachers");
  redirect("/admin/teachers");
}

// Moves one batch to a different teacher (or unassigns it).
export async function reassignBatch(batchId: string, formData: FormData) {
  await requireRole("ADMIN");
  const teacherId = String(formData.get("teacherId") ?? "") || null;
  await prisma.batch.update({ where: { id: batchId }, data: { teacherId } });
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/batches");
}

// Moves every batch currently assigned to one teacher over to another (or to
// unassigned) in one action — the common case when removing/deactivating a
// teacher who has a full schedule.
export async function reassignAllBatches(fromTeacherId: string, formData: FormData) {
  await requireRole("ADMIN");
  const toTeacherId = String(formData.get("toTeacherId") ?? "") || null;
  await prisma.batch.updateMany({ where: { teacherId: fromTeacherId }, data: { teacherId: toTeacherId } });
  revalidatePath(`/admin/teachers/${fromTeacherId}`);
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/batches");
}
