import { prisma } from "@/lib/prisma";

// Phone numbers get shared across a family, so they can't identify a student.
// Sequential, human-readable code instead: STUD-00001, STUD-00002, ...
//
// Derived from the highest existing code, not a row count: a count goes stale
// the moment a student is ever deleted (leaving a gap), and would then keep
// reissuing an already-used code forever, colliding on the unique constraint.
export async function nextStudentCode() {
  const [row] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("studentCode" FROM 6) AS INTEGER)) AS max
    FROM "Student"
    WHERE "studentCode" ~ '^STUD-[0-9]+$'
  `;
  return `STUD-${String((row?.max ?? 0) + 1).padStart(5, "0")}`;
}
