"use server";

import { signIn, signOut } from "@/lib/auth";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

export async function loginAction(_prevState: string | undefined, formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Invalid email or password.";
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export type AccountActionState = { status: "idle" | "success" | "error"; message?: string };

export async function updateProfileAction(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const user = await currentUser();
  if (!user) return { status: "error", message: "Not signed in." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: "Name is required." };

  await prisma.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/account");
  return { status: "success", message: "Profile updated." };
}

export async function changePasswordAction(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const user = await currentUser();
  if (!user) return { status: "error", message: "Not signed in." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) return { status: "error", message: "New password must be at least 8 characters." };
  if (newPassword !== confirmPassword) return { status: "error", message: "New passwords don't match." };

  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!record) return { status: "error", message: "Not signed in." };

  const valid = await bcrypt.compare(currentPassword, record.passwordHash);
  if (!valid) return { status: "error", message: "Current password is incorrect." };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return { status: "success", message: "Password changed." };
}
