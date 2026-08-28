import { describe, it, expect } from "vitest";
import { subscriptionTotals, countUsedClasses, renewalUrgency, attendanceForSubscription } from "./subscription";

function baseSub(overrides: Partial<Parameters<typeof subscriptionTotals>[0]> = {}) {
  return {
    baseClasses: 8,
    carryForwardClasses: 0,
    status: "ACTIVE",
    classesUsedAtClose: null,
    classesUsedAtMigration: 0,
    bonusGrants: [],
    ...overrides,
  };
}

describe("countUsedClasses", () => {
  it("only counts PRESENT records, not ABSENT", () => {
    const attendance = [{ status: "PRESENT" }, { status: "ABSENT" }, { status: "PRESENT" }];
    expect(countUsedClasses(attendance)).toBe(2);
  });
});

describe("subscriptionTotals", () => {
  it("adds carry-forward and bonus classes to the base plan", () => {
    const sub = baseSub({ carryForwardClasses: 2, bonusGrants: [{ classes: 3 }, { classes: 1 }] });
    const totals = subscriptionTotals(sub, 0);
    expect(totals.totalClasses).toBe(8 + 2 + 4);
    expect(totals.bonusClasses).toBe(4);
  });

  it("for an ACTIVE subscription, used = classesUsedAtMigration + live attendance count", () => {
    const sub = baseSub({ classesUsedAtMigration: 5 });
    const totals = subscriptionTotals(sub, 2);
    expect(totals.used).toBe(7);
    expect(totals.remaining).toBe(1);
  });

  it("for a closed subscription, used is the frozen classesUsedAtClose value, ignoring live attendance", () => {
    const sub = baseSub({ status: "EXPIRED", classesUsedAtClose: 8, classesUsedAtMigration: 999 });
    const totals = subscriptionTotals(sub, 100);
    expect(totals.used).toBe(8);
    expect(totals.remaining).toBe(0);
  });

  it("supports a negative classesUsedAtMigration offset to correct a plan that was double-counted (the Tanishka Tiwary case)", () => {
    // Real case: legacy CRM attendance included 2 classes from a not-yet-renewed
    // next cycle, inflating the live count to 10 against an 8-class plan.
    const sub = baseSub({ classesUsedAtMigration: -2 });
    const totals = subscriptionTotals(sub, 10);
    expect(totals.used).toBe(8);
    expect(totals.remaining).toBe(0);
  });
});

describe("renewalUrgency", () => {
  it("is 'due' at zero or negative remaining, 'soon' at 1-2, otherwise 'ok'", () => {
    expect(renewalUrgency(-1)).toBe("due");
    expect(renewalUrgency(0)).toBe("due");
    expect(renewalUrgency(1)).toBe("soon");
    expect(renewalUrgency(2)).toBe("soon");
    expect(renewalUrgency(3)).toBe("ok");
  });
});

describe("attendanceForSubscription", () => {
  it("only includes attendance on or after the subscription start date", () => {
    const start = new Date(2026, 5, 5);
    const attendance = [
      { status: "PRESENT", date: new Date(2026, 4, 1) },
      { status: "PRESENT", date: new Date(2026, 5, 5) },
      { status: "PRESENT", date: new Date(2026, 5, 6) },
    ];
    expect(attendanceForSubscription(start, attendance)).toHaveLength(2);
  });
});
