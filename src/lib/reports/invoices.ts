import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import type { CsvColumn } from "@/lib/csv";

export type InvoiceReportFilters = {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

// Defaults to the current calendar month — the report exists specifically
// to file monthly GST returns, so "no filter set" should mean "this month",
// not "every invoice ever raised".
export function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: toStr(from), to: toStr(to) };
}

export async function getInvoiceReportRows(filters: InvoiceReportFilters) {
  const { status, dateFrom, dateTo } = filters;
  return prisma.invoice.findMany({
    where: {
      status: status ? (status as "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED") : undefined,
      issueDate: {
        gte: dateFrom ? parseDateOnly(dateFrom) : undefined,
        lte: dateTo ? parseDateOnly(dateTo) : undefined,
      },
    },
    include: { student: true, payments: true },
    orderBy: { issueDate: "asc" },
  });
}

export type InvoiceReportRow = Awaited<ReturnType<typeof getInvoiceReportRows>>[number];

export const invoiceReportColumns: CsvColumn<InvoiceReportRow>[] = [
  { key: "invoiceNumber", label: "Invoice #", value: (i) => i.invoiceNumber },
  { key: "issueDate", label: "Issue date", value: (i) => i.issueDate.toISOString().slice(0, 10) },
  { key: "dueDate", label: "Due date", value: (i) => i.dueDate.toISOString().slice(0, 10) },
  { key: "studentName", label: "Student", value: (i) => i.student.name },
  { key: "studentCode", label: "Student ID", value: (i) => i.student.studentCode },
  { key: "amountWithoutGst", label: "Taxable amount", value: (i) => i.amountWithoutGst.toFixed(2) },
  { key: "cgstAmount", label: "CGST (9%)", value: (i) => i.cgstAmount.toFixed(2) },
  { key: "sgstAmount", label: "SGST (9%)", value: (i) => i.sgstAmount.toFixed(2) },
  { key: "discount", label: "Discount", value: (i) => i.discount.toFixed(2) },
  { key: "total", label: "Total (incl. GST)", value: (i) => i.total.toFixed(2) },
  { key: "paid", label: "Paid", value: (i) => i.payments.reduce((s, p) => s + p.amount, 0).toFixed(2) },
  { key: "balance", label: "Balance", value: (i) => (i.total - i.payments.reduce((s, p) => s + p.amount, 0)).toFixed(2) },
  { key: "status", label: "Status", value: (i) => i.status },
];
