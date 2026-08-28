import { NextRequest } from "next/server";
import { requireRole } from "@/lib/authz";
import { getLeadReportRows, leadReportColumns } from "@/lib/reports/leads";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  await requireRole("ADMIN");
  const { searchParams } = new URL(request.url);
  const rows = await getLeadReportRows({
    status: searchParams.get("status") ?? undefined,
    source: searchParams.get("source") ?? undefined,
    courseId: searchParams.get("courseId") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  const csv = toCsv(rows, leadReportColumns);
  return csvResponse(`leads-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
