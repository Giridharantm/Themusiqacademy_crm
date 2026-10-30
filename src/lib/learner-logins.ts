import { prisma } from "@/lib/prisma";
import { phoneMatchTail } from "@/lib/login";

// The learner (student, parent, guardian) logins that use this phone number as
// their username. The number is compared as digits, since stored numbers keep
// whatever spacing they were typed with. Normally one; if two exist (a number
// typed on two separate logins before this rule) every one is returned and the
// password decides which signs in.
export async function findLearnerLoginsByPhone(phone: string) {
  const tail = phoneMatchTail(phone);
  if (tail.length < 8) return [];
  // '[^0-9]', not '\D': a backslash inside a JS template literal is eaten before
  // the SQL ever sees it, which would leave spaces in the stored number.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    select id from "User" where role = 'PARENT' and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') like ${"%" + tail}
  `;
  if (rows.length === 0) return [];
  return prisma.user.findMany({ where: { id: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: "asc" } });
}
