import { prisma } from "@/lib/prisma";

export function parseDateOnly(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Marks one student present for one instrument+date — being marked IS the
// "present" signal, so there's no separate present/absent choice. Each call
// only ever touches that one student's own record: earlier bulk marking
// treated "whoever's in the submitted list" as the complete truth for the
// whole class and deleted anyone else's record for that date, which meant
// two people marking the same class (a stale tab, a second admin, a reload
// after someone else already saved) could silently wipe each other's work
// with no trace. Per-student marking makes that class of bug impossible —
// there's nothing to overwrite. Attendance is keyed by (student, course,
// date) — not tied to a specific batch/time-slot — so a student can attend
// a one-off makeup class on a day that isn't their usual batch and it's
// still recorded correctly.
export async function markStudentPresent(studentId: string, courseId: string, dateStr: string, markedById: string) {
  if (!dateStr) throw new Error("Date is required");
  const date = parseDateOnly(dateStr);

  await prisma.attendance.upsert({
    where: { studentId_courseId_date: { studentId, courseId, date } },
    update: { status: "PRESENT", markedById },
    create: { studentId, courseId, date, status: "PRESENT", markedById },
  });
}

// Clears a single student's attendance record for this instrument+date —
// the counterpart to markStudentPresent, scoped to exactly one record.
export async function unmarkStudentAttendance(studentId: string, courseId: string, dateStr: string) {
  if (!dateStr) throw new Error("Date is required");
  const date = parseDateOnly(dateStr);

  await prisma.attendance.deleteMany({ where: { studentId, courseId, date } });
}
