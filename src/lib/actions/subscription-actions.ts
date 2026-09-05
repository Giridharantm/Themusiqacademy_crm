"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { PLAN_CLASSES, PLAN_DAYS, addDays, countUsedClasses, attendanceForSubscription, type SubscriptionPlan } from "@/lib/subscription";

async function attendanceForCourse(studentId: string, courseId: string) {
  return prisma.attendance.findMany({ where: { studentId, courseId } });
}

// Closes the student's current active subscription for this course (if any),
// freezing its usage stats (pooled across every batch they attended for that
// course, including any comp/reschedule classes), and returns how many
// classes were left unused so the renewal can offer to carry them forward.
async function closeActiveSubscription(studentId: string, courseId: string, closeDate: Date) {
  const active = await prisma.subscription.findFirst({
    where: { studentId, courseId, status: "ACTIVE" },
    include: { bonusGrants: true },
  });
  if (!active) return 0;

  const attendance = attendanceForSubscription(active.startDate, await attendanceForCourse(studentId, courseId));
  const used = active.classesUsedAtMigration + countUsedClasses(attendance);
  const bonusClasses = active.bonusGrants.reduce((sum, g) => sum + g.classes, 0);
  const totalClasses = active.baseClasses + active.carryForwardClasses + bonusClasses;
  const remaining = Math.max(totalClasses - used, 0);

  await prisma.subscription.update({
    where: { id: active.id },
    data: { status: "EXPIRED", endDate: closeDate, classesUsedAtClose: used },
  });

  return remaining;
}

// Creates a new subscription for the student's instrument (course). If one is
// already active for that course, this acts as a renewal: the old one is
// closed out first (frozen usage stats, marked EXPIRED). Carry-forward and
// bonus classes are collected in the same form submission as the plan
// choice, so the admin reviews the full picture — base + carried-forward +
// bonus — before committing.
export async function createOrRenewSubscription(studentId: string, courseId: string, formData: FormData) {
  const user = await requireRole("ADMIN");

  const plan = String(formData.get("plan") ?? "ONE_MONTH") as SubscriptionPlan;
  const startDateRaw = String(formData.get("startDate") ?? "");
  const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
  startDate.setHours(0, 0, 0, 0);

  const baseClasses = plan === "CUSTOM" ? Number(formData.get("baseClasses") ?? 0) : PLAN_CLASSES[plan];
  if (!baseClasses || baseClasses <= 0) throw new Error("A valid number of classes is required");

  const endDateRaw = String(formData.get("endDate") ?? "");
  const endDate = endDateRaw ? new Date(endDateRaw) : plan === "CUSTOM" ? null : addDays(startDate, PLAN_DAYS[plan]);

  const availableToCarryForward = await closeActiveSubscription(studentId, courseId, startDate);

  const requestedCarryForward = Number(formData.get("carryForwardClasses") ?? 0);
  const carryForwardClasses = Math.max(0, Math.min(requestedCarryForward, availableToCarryForward));

  const bonusClasses = Number(formData.get("bonusClasses") ?? 0);
  const bonusReason = String(formData.get("bonusReason") ?? "").trim() || null;

  // Only ever submitted on a brand-new subscription (the field is hidden on
  // renewals) — lets a student who was already enrolled/attending before
  // this package existed here start with their real prior usage counted.
  const classesUsedAtMigration = Math.max(0, Number(formData.get("classesUsedAtMigration") ?? 0));

  const subscription = await prisma.subscription.create({
    data: { studentId, courseId, plan, baseClasses, carryForwardClasses, startDate, endDate, status: "ACTIVE", classesUsedAtMigration },
  });

  if (bonusClasses > 0) {
    await prisma.bonusGrant.create({
      data: { subscriptionId: subscription.id, classes: bonusClasses, reason: bonusReason, grantedById: user.id },
    });
  }

  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath(`/parent/students/${studentId}`);
  revalidatePath("/admin/attendance");
}

// Standalone top-up for an already-active subscription (e.g. a promotion
// unrelated to renewal) — not part of the renewal flow.
export async function addBonusClasses(subscriptionId: string, studentId: string, formData: FormData) {
  const user = await requireRole("ADMIN");

  const classes = Number(formData.get("classes") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!classes || classes <= 0) throw new Error("Bonus classes must be a positive number");

  await prisma.bonusGrant.create({
    data: { subscriptionId, classes, reason, grantedById: user.id },
  });

  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath(`/parent/students/${studentId}`);
}

// Corrects fields on the subscription that's still active — a typo in the
// start date, the wrong plan picked, a carry-forward number that needs
// fixing — without treating it as a renewal. Unlike createOrRenewSubscription,
// this never closes/freezes anything or touches usage stats.
export async function updateSubscription(subscriptionId: string, studentId: string, formData: FormData) {
  await requireRole("ADMIN");

  const plan = String(formData.get("plan") ?? "ONE_MONTH") as SubscriptionPlan;
  const baseClasses = plan === "CUSTOM" ? Number(formData.get("baseClasses") ?? 0) : PLAN_CLASSES[plan];
  if (!baseClasses || baseClasses <= 0) throw new Error("A valid number of classes is required");

  const carryForwardClasses = Math.max(0, Number(formData.get("carryForwardClasses") ?? 0));

  const startDateRaw = String(formData.get("startDate") ?? "");
  const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDateRaw = String(formData.get("endDate") ?? "");
  const endDate = endDateRaw ? new Date(endDateRaw) : null;

  const classesUsedAtMigration = Math.max(0, Number(formData.get("classesUsedAtMigration") ?? 0));

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { plan, baseClasses, carryForwardClasses, startDate, endDate, classesUsedAtMigration },
  });

  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath(`/parent/students/${studentId}`);
}

export async function cancelSubscription(subscriptionId: string, studentId: string) {
  await requireRole("ADMIN");

  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw new Error("Subscription not found");

  const attendance = attendanceForSubscription(
    subscription.startDate,
    await attendanceForCourse(subscription.studentId, subscription.courseId)
  );

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: "CANCELLED", endDate: new Date(), classesUsedAtClose: subscription.classesUsedAtMigration + countUsedClasses(attendance) },
  });

  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath(`/parent/students/${studentId}`);
}
