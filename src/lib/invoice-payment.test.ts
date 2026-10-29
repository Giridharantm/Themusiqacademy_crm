import { describe, it, expect } from "vitest";
import { invoiceFromPayment, needsInvoice, packagePrice, subscriptionInvoiceDescription, PAYMENT_INVOICES_FROM } from "./invoice-payment";
import { PLAN_INVOICE_AMOUNTS } from "./subscription";

describe("packagePrice", () => {
  it("uses the price list for a standard plan and the entered price for a custom one", () => {
    expect(packagePrice("THREE_MONTHS", 0)).toBe(PLAN_INVOICE_AMOUNTS.THREE_MONTHS);
    expect(packagePrice("ONE_YEAR", 999)).toBe(PLAN_INVOICE_AMOUNTS.ONE_YEAR);
    expect(packagePrice("CUSTOM", 7500)).toBe(7500);
  });
});

describe("invoiceFromPayment", () => {
  it("a full payment makes a paid invoice with the GST split", () => {
    const r = invoiceFromPayment({ price: 13680, discount: 2000, received: 11680 });
    expect(r).toMatchObject({ ok: true, total: 11680, balance: 0, status: "PAID" });
    if (r.ok) {
      expect(r.amountWithoutGst).toBeCloseTo(9898.31, 2);
      expect(r.cgstAmount).toBeCloseTo(890.85, 2);
      expect(r.sgstAmount).toBeCloseTo(890.85, 2);
    }
  });

  it("a smaller payment leaves a balance and a partial invoice", () => {
    expect(invoiceFromPayment({ price: 13680, discount: 0, received: 5000 })).toMatchObject({ ok: true, total: 13680, balance: 8680, status: "PARTIAL" });
  });

  it("refuses an overpayment, a zero payment and a bad price or discount", () => {
    expect(invoiceFromPayment({ price: 4800, discount: 0, received: 5000 })).toMatchObject({ ok: false });
    expect(invoiceFromPayment({ price: 4800, discount: 0, received: 0 })).toMatchObject({ ok: false });
    expect(invoiceFromPayment({ price: 0, discount: 0, received: 100 })).toMatchObject({ ok: false });
    expect(invoiceFromPayment({ price: 4800, discount: 5000, received: 100 })).toMatchObject({ ok: false });
  });
});

describe("needsInvoice", () => {
  const after = new Date(PAYMENT_INVOICES_FROM.getTime() + 3_600_000);
  const before = new Date(PAYMENT_INVOICES_FROM.getTime() - 3_600_000);

  it("is true only for a current, unlinked subscription started under the new rule", () => {
    expect(needsInvoice({ status: "ACTIVE", invoiceId: null, createdAt: after })).toBe(true);
    expect(needsInvoice({ status: "ACTIVE", invoiceId: "inv1", createdAt: after })).toBe(false);
    expect(needsInvoice({ status: "EXPIRED", invoiceId: null, createdAt: after })).toBe(false);
    expect(needsInvoice({ status: "ACTIVE", invoiceId: null, createdAt: before })).toBe(false);
  });
});

describe("subscriptionInvoiceDescription", () => {
  it("names the instrument and the classes in the package", () => {
    expect(subscriptionInvoiceDescription("Guitar", 24, 0, 4)).toBe("Guitar - 24 classes + 4 bonus");
    expect(subscriptionInvoiceDescription("Piano", 24, 3, 0)).toBe("Piano - 24 classes + 3 carried forward");
    expect(subscriptionInvoiceDescription("Drums", 8, 0, 0)).toBe("Drums - 8 classes");
  });
});
