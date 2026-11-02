import { describe, it, expect } from "vitest";
import { canChangeExpense, canUseCategory, monthRange, shiftMonth, sumAmounts, validateExpense } from "./expenses";
import { maskAccount, normalisePan, slipTotals, validateLine } from "./payroll";
import { buildPnl } from "./pnl";

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};

describe("month helpers", () => {
  it("reads yyyy-mm and falls back to the current month for anything else", () => {
    const now = d("2026-11-15");
    expect(monthRange("2026-03", now)).toMatchObject({ key: "2026-03", year: 2026, month: 3 });
    expect(monthRange(undefined, now).key).toBe("2026-11");
    expect(monthRange("2026-13", now).key).toBe("2026-11");
    expect(monthRange("junk", now).key).toBe("2026-11");
  });

  it("gives a half-open range, including across the new year", () => {
    const r = monthRange("2026-12", d("2026-01-01"));
    expect(r.from).toEqual(d("2026-12-01"));
    expect(r.to).toEqual(d("2027-01-01"));
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
});

describe("who may use or change an expense", () => {
  const petty = { pettyCash: true, active: true };
  const rent = { pettyCash: false, active: true };

  it("lets front desk file only under petty-cash headings, and never an inactive one", () => {
    expect(canUseCategory("FRONT_DESK", petty)).toBe(true);
    expect(canUseCategory("FRONT_DESK", rent)).toBe(false);
    expect(canUseCategory("ADMIN", rent)).toBe(true);
    expect(canUseCategory("ADMIN", { ...rent, active: false })).toBe(false);
  });

  const mine = { source: "PETTY_CASH" as const, createdById: "fd1", createdDay: "2026-11-02" };

  it("lets front desk fix their own petty cash entry the same day only", () => {
    expect(canChangeExpense("FRONT_DESK", mine, "fd1", "2026-11-02")).toBe(true);
    expect(canChangeExpense("FRONT_DESK", mine, "fd1", "2026-11-03")).toBe(false);
    expect(canChangeExpense("FRONT_DESK", mine, "fd2", "2026-11-02")).toBe(false);
    expect(canChangeExpense("FRONT_DESK", { ...mine, source: "ADMIN" }, "fd1", "2026-11-02")).toBe(false);
  });

  it("lets the admin change anything except a payroll entry", () => {
    expect(canChangeExpense("ADMIN", mine, "admin", "2026-12-01")).toBe(true);
    expect(canChangeExpense("ADMIN", { ...mine, source: "ADMIN" }, "admin", "2026-12-01")).toBe(true);
    expect(canChangeExpense("ADMIN", { ...mine, source: "PAYROLL" }, "admin", "2026-11-02")).toBe(false);
  });
});

describe("validateExpense", () => {
  const ok = { amount: 250, description: "Tea and biscuits", date: "2026-11-02" };
  it("accepts a normal entry", () => expect(validateExpense(ok, "2026-11-02")).toBeNull());
  it("rejects a missing amount, a missing reason, a bad date and a future date", () => {
    expect(validateExpense({ ...ok, amount: 0 }, "2026-11-02")).toMatch(/amount/i);
    expect(validateExpense({ ...ok, amount: NaN }, "2026-11-02")).toMatch(/amount/i);
    expect(validateExpense({ ...ok, description: "  " }, "2026-11-02")).toMatch(/for/i);
    expect(validateExpense({ ...ok, date: "" }, "2026-11-02")).toMatch(/date/i);
    expect(validateExpense({ ...ok, date: "2026-11-05" }, "2026-11-02")).toMatch(/future/i);
  });
  it("adds up to the paisa", () => expect(sumAmounts([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3));
});

describe("slipTotals", () => {
  it("is just the basic when there are no extra lines", () => {
    expect(slipTotals(30000, [])).toEqual({ basic: 30000, earnings: 0, gross: 30000, deductions: 0, net: 30000 });
  });

  it("adds earnings and takes off deductions", () => {
    const t = slipTotals(30000, [
      { label: "Incentive", amount: 2000, kind: "EARNING" },
      { label: "TDS", amount: 1500.5, kind: "DEDUCTION" },
      { label: "Advance recovered", amount: 3000, kind: "DEDUCTION" },
    ]);
    expect(t).toEqual({ basic: 30000, earnings: 2000, gross: 32000, deductions: 4500.5, net: 27499.5 });
  });

  it("rounds to the paisa", () => {
    expect(slipTotals(1000, [{ label: "x", amount: 0.1, kind: "EARNING" }, { label: "y", amount: 0.2, kind: "EARNING" }]).gross).toBe(1000.3);
  });
});

describe("slip details", () => {
  it("validates a line", () => {
    expect(validateLine("TDS", 500)).toBeNull();
    expect(validateLine(" ", 500)).toMatch(/name/i);
    expect(validateLine("TDS", 0)).toMatch(/above zero/i);
    expect(validateLine("TDS", -5)).toMatch(/above zero/i);
  });

  it("shows only the last four digits of a bank account", () => {
    expect(maskAccount("123456789012")).toBe("XXXXXXXX9012");
    expect(maskAccount("1234")).toBe("1234");
    expect(maskAccount("  ")).toBeNull();
    expect(maskAccount(null)).toBeNull();
  });

  it("checks the PAN format", () => {
    expect(normalisePan("abcde1234f")).toBe("ABCDE1234F");
    expect(normalisePan("12345")).toBe("INVALID");
    expect(normalisePan("")).toBeNull();
  });
});

describe("buildPnl", () => {
  const from = d("2026-11-01");
  const to = d("2026-12-01");

  it("takes GST out of the money received and subtracts expenses paid in the month", () => {
    const p = buildPnl({
      from,
      to,
      payments: [
        { amount: 11800, paidDate: d("2026-11-03") },
        { amount: 5900, paidDate: d("2026-11-30") },
        { amount: 99999, paidDate: d("2026-10-31") }, // last month
        { amount: 99999, paidDate: d("2026-12-01") }, // next month
      ],
      expenses: [
        { amount: 5000, date: d("2026-11-01"), categoryName: "Rent" },
        { amount: 2000, date: d("2026-11-10"), categoryName: "Rent" },
        { amount: 1000, date: d("2026-11-12"), categoryName: "Electricity" },
        { amount: 777, date: d("2026-12-02"), categoryName: "Electricity" }, // next month
      ],
    });
    expect(p.received).toBe(17700);
    expect(p.revenue).toBe(15000);
    expect(p.gstCollected).toBe(2700);
    expect(p.totalExpenses).toBe(8000);
    expect(p.profit).toBe(7000);
    expect(p.margin).toBeCloseTo(7 / 15);
    expect(p.categories.map((c) => `${c.name}:${c.amount}`)).toEqual(["Rent:7000", "Electricity:1000"]);
    expect(p.categories[0].share).toBeCloseTo(7 / 8);
  });

  it("shows a loss as a negative profit, and no margin when there was no income", () => {
    const p = buildPnl({ from, to, payments: [], expenses: [{ amount: 3000, date: d("2026-11-05"), categoryName: "Rent" }] });
    expect(p.revenue).toBe(0);
    expect(p.profit).toBe(-3000);
    expect(p.margin).toBeNull();
  });
});
