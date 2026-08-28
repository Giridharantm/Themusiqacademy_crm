import { auth } from "@/lib/auth";

export type Role = "ADMIN" | "TEACHER" | "PARENT";

export async function requireRole(...roles: Role[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  if (!roles.includes(session.user.role)) throw new Error("Not authorized");
  return session.user;
}

export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}
