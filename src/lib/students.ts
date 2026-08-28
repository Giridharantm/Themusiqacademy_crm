import { prisma } from "@/lib/prisma";

// Phone numbers get shared across a family, so they can't identify a student.
// Sequential, human-readable code instead: STUD-00001, STUD-00002, ...
export async function nextStudentCode() {
  const count = await prisma.student.count();
  return `STUD-${String(count + 1).padStart(5, "0")}`;
}
