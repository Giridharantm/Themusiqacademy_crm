import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import type { CsvColumn } from "@/lib/csv";

export type StudentReportFilters = {
  status?: string;
  courseId?: string;
  gender?: string;
  joinedFrom?: string;
  joinedTo?: string;
  q?: string;
};

export async function getStudentReportRows(filters: StudentReportFilters) {
  const { status, courseId, gender, joinedFrom, joinedTo, q } = filters;
  return prisma.student.findMany({
    where: {
      status: status || undefined,
      gender: gender || undefined,
      joinDate: {
        gte: joinedFrom ? parseDateOnly(joinedFrom) : undefined,
        lte: joinedTo ? parseDateOnly(joinedTo) : undefined,
      },
      ...(courseId ? { enrollments: { some: { batch: { courseId } } } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q } },
              { studentCode: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      enrollments: { include: { batch: { include: { course: true } } } },
      guardians: { include: { user: true } },
      subscriptions: { where: { status: "ACTIVE" }, include: { course: true } },
    },
    orderBy: { name: "asc" },
  });
}

export type StudentReportRow = Awaited<ReturnType<typeof getStudentReportRows>>[number];

export const studentReportColumns: CsvColumn<StudentReportRow>[] = [
  { key: "studentCode", label: "Student ID", value: (s) => s.studentCode },
  { key: "name", label: "Name", value: (s) => s.name },
  { key: "status", label: "Status", value: (s) => s.status },
  { key: "gender", label: "Gender", value: (s) => s.gender ?? "" },
  { key: "dob", label: "Date of birth", value: (s) => (s.dob ? s.dob.toISOString().slice(0, 10) : "") },
  { key: "phone", label: "Phone", value: (s) => s.phone ?? "" },
  { key: "email", label: "Email", value: (s) => s.email ?? "" },
  { key: "address", label: "Address", value: (s) => s.address ?? "" },
  { key: "joinDate", label: "Joined", value: (s) => s.joinDate.toISOString().slice(0, 10) },
  { key: "instruments", label: "Instruments", value: (s) => Array.from(new Set(s.enrollments.map((e) => e.batch.course.name))).join("; ") },
  { key: "batches", label: "Batches", value: (s) => s.enrollments.map((e) => e.batch.name).join("; ") },
  { key: "subscriptions", label: "Active subscriptions", value: (s) => s.subscriptions.map((sub) => `${sub.course.name} (${sub.plan})`).join("; ") },
  { key: "guardianName", label: "Guardian name", value: (s) => s.guardians.map((g) => g.user.name).join("; ") },
  { key: "guardianRelation", label: "Guardian relation", value: (s) => s.guardians.map((g) => g.relation).join("; ") },
  { key: "guardianPhone", label: "Guardian phone", value: (s) => s.guardians.map((g) => g.user.phone ?? "").join("; ") },
  { key: "guardianEmail", label: "Guardian email", value: (s) => s.guardians.map((g) => g.user.email).join("; ") },
];
