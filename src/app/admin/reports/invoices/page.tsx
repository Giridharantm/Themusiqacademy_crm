import { Card, CardBody, CardHeader, PageHeader, Input, Select, Button, EmptyState, Badge, StatCard } from "@/components/ui";
import { DownloadCsvLink } from "@/components/download-csv-link";
import { getInvoiceReportRows, currentMonthRange } from "@/lib/reports/invoices";
import { format } from "date-fns";

const PREVIEW_LIMIT = 150;

const statusColors: Record<string, string> = {
  PENDING: "yellow",
  PARTIAL: "blue",
  PAID: "green",
  OVERDUE: "red",
  CANCELLED: "slate",
};

export default async function InvoicesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const raw = await searchParams;
  const defaults = currentMonthRange();
  const dateFrom = raw.dateFrom || defaults.from;
  const dateTo = raw.dateTo || defaults.to;
  const { status } = raw;

  const rows = await getInvoiceReportRows({ status, dateFrom, dateTo });

  const taxableTotal = rows.reduce((s, i) => s + i.amountWithoutGst, 0);
  const cgstTotal = rows.reduce((s, i) => s + i.cgstAmount, 0);
  const sgstTotal = rows.reduce((s, i) => s + i.sgstAmount, 0);
  const invoicedTotal = rows.reduce((s, i) => s + i.total, 0);

  return (
    <div>
      <PageHeader title="Invoices & tax report" subtitle="Defaults to the current month — everything you need to file GST for the period" />

      <Card className="mb-6">
        <CardHeader title="Filters" />
        <CardBody>
          <form method="get" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <Input label="From" name="dateFrom" type="date" defaultValue={dateFrom} />
            <Input label="To" name="dateTo" type="date" defaultValue={dateTo} />
            <Select label="Status" name="status" defaultValue={status ?? ""}>
              <option value="">All (excl. cancelled shown too)</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIAL">Partial</option>
              <option value="PAID">Paid</option>
              <option value="OVERDUE">Overdue</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
            <Button type="submit">Apply filters</Button>
          </form>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Taxable amount" value={`Rs. ${taxableTotal.toFixed(2)}`} hint="Amount without GST" />
        <StatCard label="CGST (9%)" value={`Rs. ${cgstTotal.toFixed(2)}`} />
        <StatCard label="SGST (9%)" value={`Rs. ${sgstTotal.toFixed(2)}`} />
        <StatCard label="Total invoiced" value={`Rs. ${invoicedTotal.toFixed(2)}`} hint={`${rows.length} invoice${rows.length !== 1 ? "s" : ""}`} />
      </div>

      <Card>
        <CardHeader
          title={`${format(new Date(dateFrom), "d MMM yyyy")} – ${format(new Date(dateTo), "d MMM yyyy")}`}
          action={<DownloadCsvLink href="/admin/reports/invoices/export" params={{ status, dateFrom, dateTo }} />}
        />
        {rows.length === 0 ? (
          <CardBody>
            <EmptyState text="No invoices in this period" />
          </CardBody>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {rows.slice(0, PREVIEW_LIMIT).map((i) => (
                <li key={i.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="text-slate-900 font-medium">{i.invoiceNumber} · {i.student.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {format(i.issueDate, "d MMM yyyy")} · Taxable Rs. {i.amountWithoutGst.toFixed(2)} + GST Rs. {(i.cgstAmount + i.sgstAmount).toFixed(2)} = Rs. {i.total.toFixed(2)}
                    </p>
                  </div>
                  <Badge color={statusColors[i.status]}>{i.status}</Badge>
                </li>
              ))}
            </ul>
            {rows.length > PREVIEW_LIMIT && (
              <CardBody className="border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  Showing the first {PREVIEW_LIMIT} of {rows.length} — download the CSV for the complete list.
                </p>
              </CardBody>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
