import { describe, it, expect } from "vitest";
import { splitGst, taxTotals, paidInvoiceRevenue, GST_RATE } from "./billing";

describe("paidInvoiceRevenue", () => {
  const from = new Date(2026, 9, 1);
  const to = new Date(2026, 10, 1);
  const inv = (status: string, total: number, issueDate: Date) => ({ status, total, issueDate });

  it("counts only PAID invoices raised in the month", () => {
    const rows = [
      inv("PAID", 4800, new Date(2026, 9, 5)),
      inv("PAID", 13680, new Date(2026, 9, 31, 23, 30)),
      inv("PENDING", 4800, new Date(2026, 9, 6)),
      inv("PARTIAL", 4800, new Date(2026, 9, 7)),
      inv("OVERDUE", 4800, new Date(2026, 9, 8)),
      inv("CANCELLED", 12680, new Date(2026, 9, 9)),
    ];
    expect(paidInvoiceRevenue(rows, from, to)).toBe(18480);
  });

  it("belongs to the month the invoice was raised, not the month it was paid", () => {
    const septInvoicePaidInOctober = inv("PAID", 4800, new Date(2026, 8, 17));
    expect(paidInvoiceRevenue([septInvoicePaidInOctober], from, to)).toBe(0);
  });

  it("treats the start as inclusive and the end as exclusive", () => {
    const rows = [inv("PAID", 100, from), inv("PAID", 200, to)];
    expect(paidInvoiceRevenue(rows, from, to)).toBe(100);
  });
});

describe("taxTotals", () => {
  const inv = (status: string, total: number) => ({ status, total, ...splitGst(total) });

  it("sums live invoices and leaves cancelled ones out of every figure", () => {
    const t = taxTotals([inv("PAID", 4800), inv("CANCELLED", 13680), inv("PENDING", 4800)]);
    expect(t.count).toBe(2);
    expect(t.cancelledCount).toBe(1);
    expect(t.invoiced).toBe(9600);
    expect(t.taxable + t.cgst + t.sgst).toBeCloseTo(9600, 8);
  });

  it("returns zeros when everything is cancelled or there are no invoices", () => {
    expect(taxTotals([inv("CANCELLED", 4800)])).toMatchObject({ count: 0, cancelledCount: 1, taxable: 0, cgst: 0, sgst: 0, invoiced: 0 });
    expect(taxTotals([])).toMatchObject({ count: 0, cancelledCount: 0, invoiced: 0 });
  });
});

describe("splitGst", () => {
  it("splits a GST-inclusive total into equal CGST/SGST halves", () => {
    const { amountWithoutGst, cgstAmount, sgstAmount } = splitGst(4800);
    expect(cgstAmount).toBeCloseTo(sgstAmount, 10);
    expect(amountWithoutGst + cgstAmount + sgstAmount).toBeCloseTo(4800, 10);
  });

  it("computes the pre-tax amount using the current GST rate", () => {
    const total = 11800;
    const { amountWithoutGst } = splitGst(total);
    expect(amountWithoutGst).toBeCloseTo(total / (1 + GST_RATE), 10);
  });

  it("returns zero breakdown for a zero total", () => {
    const result = splitGst(0);
    expect(result).toEqual({ amountWithoutGst: 0, cgstAmount: 0, sgstAmount: 0 });
  });
});
