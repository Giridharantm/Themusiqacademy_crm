"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { defaultLoginPassword } from "@/lib/login-password";
import { isPlaceholderEmail, placeholderEmail } from "@/lib/login";
import { findLearnerLoginsByPhone } from "@/lib/learner-logins";
import { normalizePhone } from "@/lib/whatsapp-notices";

// The admin's "Users" page: everyone who can sign in — staff, teachers and
// learner logins — to correct, give a new password, switch off or remove.
// Passwords are stored scrambled (bcrypt), so they can be replaced but never
// shown. Admin only; front desk can't reach any of this.

const MIN_PASSWORD = 8;
const refresh = () => revalidatePath("/admin/users");

// Front desk logins have no default password: one has to be chosen.
export async function createFrontDesk(formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");

  if (!name || !email) throw new Error("Name and email are required");
  if (password.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters`);
  if (await prisma.user.findUnique({ where: { email } })) throw new Error("A user with this email already exists");

  await prisma.user.create({ data: { name, email, phone, role: "FRONT_DESK", passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: new Date() } });
  refresh();
}

// Name, email and phone. For a learner login the phone number IS the username,
// so it is required and can't be another login's number; their email is
// optional (a placeholder is kept when it is left blank).
export async function updateUserDetails(userId: string, formData: FormData) {
  await requireRole("ADMIN");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const name = String(formData.get("name") ?? "").trim();
  const emailInput = String(formData.get("email") ?? "").trim();
  const phoneInput = String(formData.get("phone") ?? "").trim() || null;
  if (!name) throw new Error("Name is required");

  let email = emailInput;
  if (user.role === "PARENT") {
    const phone = normalizePhone(phoneInput);
    if (!phone) throw new Error("A valid phone number is needed — it is their username");
    if ((await findLearnerLoginsByPhone(phone)).some((u) => u.id !== userId)) throw new Error("Another login already uses this number");
    if (!email || isPlaceholderEmail(email)) email = placeholderEmail(phone);
  } else if (!email) {
    throw new Error("Email is required — it is how they sign in");
  }

  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash && clash.id !== userId) throw new Error("A user with this email already exists");

  await prisma.user.update({ where: { id: userId }, data: { name, email, phone: phoneInput } });
  refresh();
}

export async function setUserPassword(userId: string, formData: FormData) {
  await requireRole("ADMIN");

  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters`);

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: new Date() } });
  refresh();
}

// Puts a learner's password back to their phone number (the first password),
// e.g. when they've forgotten the one they chose.
export async function resetLearnerPasswordToPhone(userId: string) {
  await requireRole("ADMIN");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "PARENT") throw new Error("Only a learner login can be reset to a phone number");
  const password = defaultLoginPassword(user.phone);
  if (!password) throw new Error("This login has no usable phone number");

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: null } });
  refresh();
}

// Switching a login off blocks sign-in at once and keeps its history.
export async function setUserStatus(userId: string, status: "ACTIVE" | "INACTIVE") {
  const admin = await requireRole("ADMIN");
  if (userId === admin.id) throw new Error("You can't switch off your own login");

  await prisma.user.update({ where: { id: userId }, data: { status } });
  refresh();
}

// Removes the login. Admin logins can only be switched off. A teacher with
// batches or history, or anyone whose records are attached elsewhere, is
// refused — switch those off instead.
export async function deleteUser(userId: string) {
  const admin = await requireRole("ADMIN");
  if (userId === admin.id) throw new Error("You can't delete your own login");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  if (user.role === "ADMIN") throw new Error("Admin logins can be switched off, not deleted");

  if (user.role === "TEACHER") {
    const [batches, homework, feedback, attendance] = await Promise.all([
      prisma.batch.count({ where: { teacherId: userId } }),
      prisma.homework.count({ where: { teacherId: userId } }),
      prisma.feedback.count({ where: { teacherId: userId } }),
      prisma.attendance.count({ where: { markedById: userId } }),
    ]);
    if (batches + homework + feedback + attendance > 0) throw new Error("This teacher has batches or history attached — switch the login off instead of deleting it");
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") throw new Error("This login has records attached — switch it off instead of deleting it");
    throw err;
  }
  refresh();
}
