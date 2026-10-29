import { describe, it, expect } from "vitest";
import { amountInWords, courseInDescription, invoiceDate, itemEnrolment, money, planForAmount, validityLabel } from "./invoice";
import { PLAN_DAYS, PLAN_INVOICE_AMOUNTS } from "./subscription";

describe("planForAmount", () => {
  it("recognises every price on the price list", () => {
    expect(planForAmount(PLAN_INVOICE_AMOUNTS.ONE_MONTH)).toBe("ONE_MONTH");
    expect(planForAmount(PLAN_INVOICE_AMOUNTS.THREE_MONTHS)).toBe("THREE_MONTHS");
    expect(planForAmount(PLAN_INVOICE_AMOUNTS.SIX_MONTHS)).toBe("SIX_MONTHS");
    expect(planForAmount(PLAN_INVOICE_AMOUNTS.ONE_YEAR)).toBe("ONE_YEAR");
  });

  it("has no plan for any other amount", () => {
    expect(planForAmount(5000)).toBeNull();
    expect(planForAmount(0)).toBeNull();
  });
});

describe("validityLabel", () => {
  it("says months for whole 30-day months and days otherwise", () => {
    expect(validityLabel(PLAN_DAYS.THREE_MONTHS)).toBe("4 months");
    expect(validityLabel(PLAN_DAYS.SIX_MONTHS)).toBe("8 months");
    expect(validityLabel(PLAN_DAYS.ONE_YEAR)).toBe("16 months");
    expect(validityLabel(PLAN_DAYS.ONE_MONTH)).toBe("40 days");
    expect(validityLabel(30)).toBe("1 month");
  });
});

describe("courseInDescription", () => {
  const courses = ["Piano", "Guitar", "Hindustani Vocals", "Vocals"];

  it("finds the instrument inside a free-text description", () => {
    expect(courseInDescription("Piano - Beginner - 24 classes + 2 bonus", courses)).toBe("Piano");
    expect(courseInDescription("guitar fee", courses)).toBe("Guitar");
  });

  it("prefers the longest matching name", () => {
    expect(courseInDescription("Hindustani Vocals fee", courses)).toBe("Hindustani Vocals");
  });

  it("returns null when no course is named", () => {
    expect(courseInDescription("Registration fee", courses)).toBeNull();
  });
});

describe("itemEnrolment", () => {
  const courses = ["Guitar"];

  it("describes a plan-priced item with its instrument, classes and validity", () => {
    expect(itemEnrolment({ description: "Guitar fee", amount: PLAN_INVOICE_AMOUNTS.THREE_MONTHS }, courses)).toEqual({
      instrument: "Guitar",
      planLabel: "3 Months enrolment",
      classesLabel: "24 classes",
      validity: "4 months",
    });
  });

  it("does not repeat the class count when the description already has it", () => {
    const e = itemEnrolment({ description: "Guitar - 24 classes + 4 bonus", amount: PLAN_INVOICE_AMOUNTS.THREE_MONTHS }, courses);
    expect(e.classesLabel).toBeNull();
    expect(e.planLabel).toBe("3 Months enrolment");
  });

  it("leaves plan details out for an amount that is not on the price list", () => {
    expect(itemEnrolment({ description: "Guitar fee", amount: 777 }, courses)).toEqual({
      instrument: "Guitar",
      planLabel: null,
      classesLabel: null,
      validity: null,
    });
  });
});

describe("amountInWords", () => {
  it("writes rupees in the Indian system", () => {
    expect(amountInWords(12680)).toBe("Rupees Twelve Thousand Six Hundred Eighty Only");
    expect(amountInWords(4800)).toBe("Rupees Four Thousand Eight Hundred Only");
    expect(amountInWords(40320)).toBe("Rupees Forty Thousand Three Hundred Twenty Only");
    expect(amountInWords(125000)).toBe("Rupees One Lakh Twenty Five Thousand Only");
    expect(amountInWords(10_000_000)).toBe("Rupees One Crore Only");
    expect(amountInWords(19)).toBe("Rupees Nineteen Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
  });

  it("adds paise when there are any", () => {
    expect(amountInWords(10745.76)).toBe("Rupees Ten Thousand Seven Hundred Forty Five and Seventy Six Paise Only");
    expect(amountInWords(0.5)).toBe("Rupees Zero and Fifty Paise Only");
  });
});

describe("formatting", () => {
  it("shows dates as they are in India", () => {
    // 20:00 UTC on 27 Oct is already 28 Oct in India
    expect(invoiceDate(new Date("2026-10-27T20:00:00Z"))).toBe("28 Oct 2026");
    expect(invoiceDate(new Date("2026-11-03T00:00:00Z"))).toBe("3 Nov 2026");
  });

  it("formats money with Indian grouping and two decimals", () => {
    expect(money(12680)).toBe("12,680.00");
    expect(money(125000.5)).toBe("1,25,000.50");
  });
});
