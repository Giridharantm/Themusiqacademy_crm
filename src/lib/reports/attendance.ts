import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import type { CsvColumn } from "@/lib/csv";

export type AttendanceReportFilters = {
  courseId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
};

export async function getAttendanceReportRows(filters: AttendanceReportFilters) {
  const { courseId, status, dateFrom, dateTo, q } = filters;
  return prisma.attendance.findMany({
    where: {
      courseId: courseId || undefined,
      status: status ? (status as "PRESENT" | "ABSENT") : undefined,
      date: {
        gte: dateFrom ? parseDateOnly(dateFrom) : undefined,
        lte: dateTo ? parseDateOnly(dateTo) : undefined,
      },
      ...(q ? { student: { OR: [{ name: { contains: q } }, { studentCode: { contains: q } }] } } : {}),
    },
    include: { student: true, course: true, markedBy: true },
    orderBy: { date: "desc" },
  });
}

export type AttendanceReportRow = Awaited<ReturnType<typeof getAttendanceReportRows>>[number];

export const attendanceReportColumns: CsvColumn<AttendanceReportRow>[] = [
  { key: "date", label: "Date", value: (a) => a.date.toISOString().slice(0, 10) },
  { key: "studentName", label: "Student name", value: (a) => a.student.name },
  { key: "studentCode", label: "Student ID", value: (a) => a.student.studentCode },
  { key: "instrument", label: "Instrument", value: (a) => a.course.name },
  { key: "status", label: "Status", value: (a) => a.status },
  { key: "markedBy", label: "Marked by", value: (a) => a.markedBy?.name ?? "" },
];
