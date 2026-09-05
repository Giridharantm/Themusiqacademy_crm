"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { nextStudentCode } from "@/lib/students";
import { PLAN_CLASSES, PLAN_DAYS, addDays, type SubscriptionPlan } from "@/lib/subscription";
import bcrypt from "bcryptjs";

export async function createStudent(formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const dobRaw = String(formData.get("dob") ?? "");
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;

  if (!name) throw new Error("Name is required");

  const student = await prisma.student.create({
    data: {
      studentCode: await nextStudentCode(),
      name,
      dob: dobRaw ? new Date(dobRaw) : null,
      gender,
      phone,
      email,
      address,
    },
  });

  revalidatePath("/admin/students");
  return student.id;
}

export async function updateStudentStatus(studentId: string, status: string) {
  await requireRole("ADMIN");
  await prisma.student.update({ where: { id: studentId }, data: { status } });
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/admin/students");
}

export async function addGuardian(studentId: string, formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const relation = String(formData.get("relation") ?? "Parent").trim();

  if (!name || !email) throw new Error("Guardian name and email are required");

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await bcrypt.hash("password123", 10);
    user = await prisma.user.create({
      data: { name, email, phone, role: "PARENT", passwordHash },
    });
  }

  await prisma.studentGuardian.upsert({
    where: { studentId_userId: { studentId, userId: user.id } },
    update: { relation },
    create: { studentId, userId: user.id, relation },
  });

  revalidatePath(`/admin/students/${studentId}`);
}

export async function removeGuardian(studentId: string, userId: string) {
  await requireRole("ADMIN");
  await prisma.studentGuardian.delete({ where: { studentId_userId: { studentId, userId } } });
  revalidatePath(`/admin/students/${studentId}`);
}

// Enrolls a student into one or more batches at once — a subscription's
// plan is usually spread across a couple of day-slots a week (e.g. Guitar
// Tue + Thu), so this doesn't force a submit-reload-repeat loop per batch.
// For each distinct instrument (Course) among the batches that doesn't
// already have an active subscription, this also creates one from that
// instrument's plan/bonus fields (named `sub_{courseId}_*`) in the same
// submission — a fresh enrollment needs a package just like a renewal does.
// A course that already has an active subscription (e.g. this is a second
// day-slot of an instrument the student's already subscribed to) just draws
// from the existing pooled package and needs no subscription fields.
export async function enrollInBatch(studentId: string, formData: FormData) {
  const user = await requireRole("ADMIN");

  const batchIds = formData.getAll("batchIds").map(String).filter(Boolean);
  if (batchIds.length === 0) throw new Error("At least one batch is required");

  const startDateRaw = String(formData.get("startDate") ?? "");
  const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
  startDate.setHours(0, 0, 0, 0);

  const batches = await prisma.batch.findMany({ where: { id: { in: batchIds } } });
  if (batches.length !== batchIds.length) throw new Error("One or more batches were not found");

  for (const batch of batches) {
    await prisma.enrollment.create({
      data: { studentId, batchId: batch.id, startDate, status: "ACTIVE" },
    });
  }

  const courseIds = Array.from(new Set(batches.map((b) => b.courseId)));
  for (const courseId of courseIds) {
    const existingActive = await prisma.subscription.findFirst({
      where: { studentId, courseId, status: "ACTIVE" },
    });
    if (existingActive) continue;

    const prefix = `sub_${courseId}_`;
    const plan = String(formData.get(`${prefix}plan`) ?? "") as SubscriptionPlan | "";
    if (!plan) continue;

    const baseClasses = plan === "CUSTOM" ? Number(formData.get(`${prefix}baseClasses`) ?? 0) : PLAN_CLASSES[plan];
    if (baseClasses <= 0) continue;

    const endDateRaw = String(formData.get(`${prefix}endDate`) ?? "");
    const endDate = endDateRaw ? new Date(endDateRaw) : plan === "CUSTOM" ? null : addDays(startDate, PLAN_DAYS[plan]);

    const classesUsedAtMigration = Math.max(0, Number(formData.get(`${prefix}classesUsedAtMigration`) ?? 0));

    const subscription = await prisma.subscription.create({
      data: { studentId, courseId, plan, baseClasses, startDate, endDate, status: "ACTIVE", classesUsedAtMigration },
    });

    const bonusClasses = Number(formData.get(`${prefix}bonusClasses`) ?? 0);
    const bonusReason = String(formData.get(`${prefix}bonusReason`) ?? "").trim() || null;
    if (bonusClasses > 0) {
      await prisma.bonusGrant.create({
        data: { subscriptionId: subscription.id, classes: bonusClasses, reason: bonusReason, grantedById: user.id },
      });
    }
  }

  revalidatePath(`/admin/students/${studentId}`);
}

// Moves an enrollment to a different batch of the SAME instrument (e.g.
// swapping a student from Tuesday to Wednesday) — switching instrument
// entirely should go through delete + a fresh enrollment instead, since that
// changes which subscription pool the enrollment draws from.
export async function updateEnrollmentBatch(enrollmentId: string, studentId: string, formData: FormData) {
  await requireRole("ADMIN");

  const newBatchId = String(formData.get("batchId") ?? "");
  if (!newBatchId) throw new Error("A batch is required");

  const [enrollment, newBatch] = await Promise.all([
    prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { batch: true } }),
    prisma.batch.findUnique({ where: { id: newBatchId } }),
  ]);
  if (!enrollment) throw new Error("Enrollment not found");
  if (!newBatch) throw new Error("Batch not found");
  if (newBatch.courseId !== enrollment.batch.courseId) {
    throw new Error("Can only move an enrollment to a different day/time of the same instrument");
  }

  const clash = await prisma.enrollment.findUnique({
    where: { studentId_batchId: { studentId, batchId: newBatchId } },
  });
  if (clash && clash.id !== enrollmentId) throw new Error("Already enrolled in that batch");

  await prisma.enrollment.update({ where: { id: enrollmentId }, data: { batchId: newBatchId } });

  revalidatePath(`/admin/students/${studentId}`);
}

// Removes an enrollment outright — for correcting a mistaken batch pick.
// Attendance and subscriptions are independent of Enrollment (they key off
// student+course, not the enrollment row), so this can't orphan any history.
export async function deleteEnrollment(enrollmentId: string, studentId: string) {
  await requireRole("ADMIN");
  await prisma.enrollment.delete({ where: { id: enrollmentId } });
  revalidatePath(`/admin/students/${studentId}`);
}

export async function updateEnrollmentStatus(enrollmentId: string, studentId: string, status: string) {
  await requireRole("ADMIN");
  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      status: status as "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED",
      endDate: status === "COMPLETED" || status === "CANCELLED" ? new Date() : null,
    },
  });
  revalidatePath(`/admin/students/${studentId}`);
}
