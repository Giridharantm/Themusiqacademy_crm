import { NextRequest } from "next/server";
import { requireRole } from "@/lib/authz";
import { getStudentReportRows, studentReportColumns } from "@/lib/reports/students";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  await requireRole("ADMIN");
  const { searchParams } = new URL(request.url);
  const rows = await getStudentReportRows({
    status: searchParams.get("status") ?? undefined,
    courseId: searchParams.get("courseId") ?? undefined,
    gender: searchParams.get("gender") ?? undefined,
    joinedFrom: searchParams.get("joinedFrom") ?? undefined,
    joinedTo: searchParams.get("joinedTo") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  const csv = toCsv(rows, studentReportColumns);
  return csvResponse(`students-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
