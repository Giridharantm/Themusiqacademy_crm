import { describe, it, expect } from "vitest";
import { checkPayment, invoiceFromPayments, isPackagePlan, packageDescription, packageEnd } from "./invoice-payment";
import { PLAN_INVOICE_AMOUNTS } from "./subscription";

describe("isPackagePlan", () => {
  it("accepts the four priced plans only", () => {
    expect(isPackagePlan("THREE_MONTHS")).toBe(true);
    expect(isPackagePlan("CUSTOM")).toBe(false);
    expect(isPackagePlan("nonsense")).toBe(false);
  });
});

describe("checkPayment", () => {
  it("accepts the full fee after discount, or less for a part payment", () => {
    expect(checkPayment({ plan: "THREE_MONTHS", discount: 0, amount: 13680 })).toBeNull();
    expect(checkPayment({ plan: "THREE_MONTHS", discount: 2000, amount: 11680 })).toBeNull();
    expect(checkPayment({ plan: "THREE_MONTHS", discount: 0, amount: 5000 })).toBeNull();
  });

  it("takes any discount amount, not just round steps", () => {
    expect(checkPayment({ plan: "SIX_MONTHS", discount: 5760, amount: 20160 })).toBeNull();
  });

  it("refuses an overpayment, no payment and a bad discount", () => {
    expect(checkPayment({ plan: "THREE_MONTHS", discount: 2000, amount: 13680 })).not.toBeNull();
    expect(checkPayment({ plan: "THREE_MONTHS", discount: 0, amount: 0 })).not.toBeNull();
    expect(checkPayment({ plan: "THREE_MONTHS", discount: -1, amount: 100 })).not.toBeNull();
    expect(checkPayment({ plan: "THREE_MONTHS", discount: PLAN_INVOICE_AMOUNTS.THREE_MONTHS, amount: 100 })).not.toBeNull();
  });
});

describe("invoiceFromPayments", () => {
  it("one fully paid package makes a paid invoice with the GST split", () => {
    const r = invoiceFromPayments([{ plan: "THREE_MONTHS", discount: 2000, amount: 11680 }]);
    expect(r).toMatchObject({ ok: true, gross: 13680, discount: 2000, total: 11680, received: 11680, balance: 0, status: "PAID" });
    if (r.ok) {
      expect(r.amountWithoutGst).toBeCloseTo(9898.31, 2);
      expect(r.cgstAmount).toBeCloseTo(890.85, 2);
    }
  });

  it("a year paid at once and split over two instruments is one invoice", () => {
    const r = invoiceFromPayments([
      { plan: "SIX_MONTHS", discount: 5760, amount: 20160 },
      { plan: "SIX_MONTHS", discount: 5760, amount: 20160 },
    ]);
    expect(r).toMatchObject({ ok: true, gross: 51840, discount: 11520, total: 40320, received: 40320, balance: 0, status: "PAID" });
  });

  it("payments short of the fee leave a balance and a partial invoice", () => {
    expect(invoiceFromPayments([{ plan: "THREE_MONTHS", discount: 0, amount: 5000 }])).toMatchObject({ ok: true, total: 13680, balance: 8680, status: "PARTIAL" });
  });

  it("refuses no payments", () => {
    expect(invoiceFromPayments([])).toMatchObject({ ok: false });
  });
});

describe("package helpers", () => {
  it("describes the line with the instrument and class count", () => {
    expect(packageDescription("Guitar", "THREE_MONTHS")).toBe("Guitar - 24 classes");
    expect(packageDescription("Drums", "ONE_MONTH")).toBe("Drums - 8 classes");
  });

  it("ends a package after its plan's days", () => {
    expect(packageEnd(new Date(2026, 10, 1), "THREE_MONTHS")).toEqual(new Date(2027, 2, 1)); // 120 days after 1 Nov 2026
  });
});
