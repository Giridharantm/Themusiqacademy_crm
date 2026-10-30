"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

const MIN_PASSWORD = 8;

// Front desk logins are made and managed by the admin only. Unlike a teacher
// account there is no default password: one has to be chosen.
export async function createFrontDesk(formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");

  if (!name || !email) throw new Error("Name and email are required");
  if (password.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters`);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("A user with this email already exists");

  await prisma.user.create({ data: { name, email, phone, role: "FRONT_DESK", passwordHash: await bcrypt.hash(password, 10) } });
  revalidatePath("/admin/staff");
}

// Deactivating blocks the login at once and keeps the account, so anything it
// recorded stays on file.
export async function setFrontDeskStatus(userId: string, status: "ACTIVE" | "INACTIVE") {
  await requireRole("ADMIN");
  await prisma.user.updateMany({ where: { id: userId, role: "FRONT_DESK" }, data: { status } });
  revalidatePath("/admin/staff");
}

export async function resetFrontDeskPassword(userId: string, formData: FormData) {
  await requireRole("ADMIN");

  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters`);

  await prisma.user.updateMany({ where: { id: userId, role: "FRONT_DESK" }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  revalidatePath("/admin/staff");
}
