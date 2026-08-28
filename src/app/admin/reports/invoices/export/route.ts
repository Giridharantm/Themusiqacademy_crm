import { NextRequest } from "next/server";
import { requireRole } from "@/lib/authz";
import { getInvoiceReportRows, invoiceReportColumns, currentMonthRange } from "@/lib/reports/invoices";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  await requireRole("ADMIN");
  const { searchParams } = new URL(request.url);
  const defaults = currentMonthRange();
  const rows = await getInvoiceReportRows({
    status: searchParams.get("status") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? defaults.from,
    dateTo: searchParams.get("dateTo") ?? defaults.to,
  });
  const csv = toCsv(rows, invoiceReportColumns);
  return csvResponse(`invoices-tax-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
