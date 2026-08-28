import { prisma } from "@/lib/prisma";

export function parseDateOnly(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Marks attendance for a whole class session at once — the usual case being
// 6-8 students in one instrument's class on one date. `studentIds` is
// exactly who attended: everyone still in the list (the roster, minus
// anyone removed as a no-show, plus any comp/reschedule students added for
// this session) is marked PRESENT — being in the list to save IS the
// "present" signal, so there's no separate present/absent choice. Anyone
// removed simply gets no record at all rather than an explicit ABSENT one:
// this call deletes any existing record for this course+date that isn't in
// the submitted list, so re-editing a date to remove someone actually
// clears their prior mark instead of leaving it stale. Attendance is keyed
// by (student, course, date) — not tied to a specific batch/time-slot — so
// a student can attend a one-off makeup class on a day that isn't their
// usual batch and it's still recorded correctly.
export async function markBulkAttendance(courseId: string, dateStr: string, formData: FormData, markedById: string) {
  if (!dateStr) throw new Error("Date is required");
  const date = parseDateOnly(dateStr);

  const studentIds = formData.getAll("studentIds").map(String);

  await prisma.attendance.deleteMany({
    where: { courseId, date, studentId: { notIn: studentIds } },
  });

  for (const studentId of studentIds) {
    await prisma.attendance.upsert({
      where: { studentId_courseId_date: { studentId, courseId, date } },
      update: { status: "PRESENT", markedById },
      create: { studentId, courseId, date, status: "PRESENT", markedById },
    });
  }

  return studentIds;
}
