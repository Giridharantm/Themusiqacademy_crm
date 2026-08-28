import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import type { CsvColumn } from "@/lib/csv";

export type LeadReportFilters = {
  status?: string;
  source?: string;
  courseId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
};

export async function getLeadReportRows(filters: LeadReportFilters) {
  const { status, source, courseId, dateFrom, dateTo, q } = filters;
  return prisma.lead.findMany({
    where: {
      status: status ? (status as "NEW" | "CONTACTED" | "TRIAL_SCHEDULED" | "CONVERTED" | "LOST") : undefined,
      source: source ? (source as "CALL" | "WALK_IN" | "REFERRAL" | "ONLINE" | "OTHER") : undefined,
      interestedCourseId: courseId || undefined,
      createdAt: {
        gte: dateFrom ? parseDateOnly(dateFrom) : undefined,
        lte: dateTo ? parseDateOnly(dateTo) : undefined,
      },
      ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }] } : {}),
    },
    include: {
      interestedCourse: true,
      assignedTo: true,
      student: true,
      followUps: { orderBy: { followUpDate: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export type LeadReportRow = Awaited<ReturnType<typeof getLeadReportRows>>[number];

export const leadReportColumns: CsvColumn<LeadReportRow>[] = [
  { key: "name", label: "Name", value: (l) => l.name },
  { key: "phone", label: "Phone", value: (l) => l.phone },
  { key: "email", label: "Email", value: (l) => l.email ?? "" },
  { key: "source", label: "Source", value: (l) => l.source },
  { key: "status", label: "Status", value: (l) => l.status },
  { key: "interestedCourse", label: "Interested instrument", value: (l) => l.interestedCourse?.name ?? "" },
  { key: "assignedTo", label: "Assigned to", value: (l) => l.assignedTo?.name ?? "" },
  { key: "createdAt", label: "Created", value: (l) => l.createdAt.toISOString().slice(0, 10) },
  { key: "lastFollowUpDate", label: "Last follow-up date", value: (l) => (l.followUps[0] ? l.followUps[0].followUpDate.toISOString().slice(0, 10) : "") },
  { key: "lastFollowUpNote", label: "Last follow-up note", value: (l) => l.followUps[0]?.note ?? "" },
  { key: "convertedStudentId", label: "Converted student ID", value: (l) => l.student?.id ?? "" },
  { key: "notes", label: "Notes", value: (l) => l.notes ?? "" },
];
