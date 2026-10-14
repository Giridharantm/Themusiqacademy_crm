// Line item prices (PLAN_INVOICE_AMOUNTS) are GST-inclusive — 18% combined,
// split evenly as 9% CGST + 9% SGST for an intra-state invoice. The
// breakdown is computed once at invoice-creation time and stored on the
// Invoice row (not recalculated from `total` on every render), so a future
// GST-rate change can't silently rewrite a past invoice's tax breakdown.
export const GST_RATE = 0.18;

type TaxableInvoice = {
  status: string;
  amountWithoutGst: number;
  cgstAmount: number;
  sgstAmount: number;
  total: number;
};

// Totals for the GST report. A cancelled invoice was never a taxable supply,
// so it's left out of every figure — it stays visible as a row (with its
// CANCELLED status) but must not inflate the return.
export function taxTotals(invoices: TaxableInvoice[]) {
  const live = invoices.filter((i) => i.status !== "CANCELLED");
  return {
    count: live.length,
    cancelledCount: invoices.length - live.length,
    taxable: live.reduce((s, i) => s + i.amountWithoutGst, 0),
    cgst: live.reduce((s, i) => s + i.cgstAmount, 0),
    sgst: live.reduce((s, i) => s + i.sgstAmount, 0),
    invoiced: live.reduce((s, i) => s + i.total, 0),
  };
}

// "Revenue this month": the total of invoices raised in the month that are
// fully PAID. Pending, partial, overdue and cancelled invoices don't count.
// Counting by invoice date (not by when the money arrived) keeps this figure
// equal to the GST report's "Total invoiced" for the same month; an invoice
// raised in September but paid in October belongs to September.
export function paidInvoiceRevenue(
  invoices: { status: string; total: number; issueDate: Date }[],
  from: Date,
  toExclusive: Date
) {
  return invoices
    .filter((i) => i.status === "PAID" && i.issueDate >= from && i.issueDate < toExclusive)
    .reduce((sum, i) => sum + i.total, 0);
}

export function splitGst(totalInclusive: number) {
  const amountWithoutGst = totalInclusive / (1 + GST_RATE);
  const gstTotal = totalInclusive - amountWithoutGst;
  return {
    amountWithoutGst,
    cgstAmount: gstTotal / 2,
    sgstAmount: gstTotal / 2,
  };
}
