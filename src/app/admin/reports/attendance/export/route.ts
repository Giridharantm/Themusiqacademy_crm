import { NextRequest } from "next/server";
import { requireRole } from "@/lib/authz";
import { getAttendanceReportRows, attendanceReportColumns } from "@/lib/reports/attendance";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  await requireRole("ADMIN");
  const { searchParams } = new URL(request.url);
  const rows = await getAttendanceReportRows({
    courseId: searchParams.get("courseId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  const csv = toCsv(rows, attendanceReportColumns);
  return csvResponse(`attendance-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
