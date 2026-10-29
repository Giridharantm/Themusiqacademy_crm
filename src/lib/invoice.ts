import { PLAN_CLASSES, PLAN_DAYS, PLAN_INVOICE_AMOUNTS, PLAN_LABELS, type SubscriptionPlan } from "@/lib/subscription";

// Who the invoice is from — printed at the top of every invoice.
export const COMPANY = {
  legalName: "THE MUSIQ GC ACADEMY LLP",
  tradingAs: "The Musiq Academy",
  addressLines: ["3rd Floor, 242/1A, Plot No. 1A, Borewell Road,", "Above Axis Bank, Whitefield, Bengaluru - 560066,", "Karnataka, India"],
  gstin: "29ABAFT9333N1ZI",
  stateName: "Karnataka",
  stateCode: "29",
  phone: "+91 70901 30000",
  email: "info@themusiqacademy.com",
  website: "themusiqacademy.com",
};

type InvoicePlan = Exclude<SubscriptionPlan, "CUSTOM">;

// Invoice line items are free text, but their amounts only ever come from the
// price list (one price per plan duration), so the amount says which plan was
// sold. Older or hand-edited invoices with another amount simply have no plan.
export function planForAmount(amount: number): InvoicePlan | null {
  const found = (Object.keys(PLAN_INVOICE_AMOUNTS) as InvoicePlan[]).find((p) => PLAN_INVOICE_AMOUNTS[p] === amount);
  return found ?? null;
}

// How long a plan stays valid, in words: whole 30-day months read as months
// (120 days = "4 months"), anything else stays in days (40 days).
export function validityLabel(days: number): string {
  if (days > 0 && days % 30 === 0) {
    const months = days / 30;
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  return `${days} days`;
}

// The instrument a line item is for: the longest course name that appears in
// its description ("Piano - Beginner - 24 classes" -> "Piano").
export function courseInDescription(description: string, courseNames: string[]): string | null {
  const text = description.toLowerCase();
  const matches = courseNames.filter((n) => n && text.includes(n.toLowerCase()));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0];
}

export type ItemEnrolment = {
  instrument: string | null;
  planLabel: string | null; // "3 Months enrolment"
  classesLabel: string | null; // "24 classes" — left out when the description already says it
  validity: string | null; // "4 months"
};

export type EnrolmentItem = {
  description: string;
  amount: number;
  plan?: SubscriptionPlan | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
};

// What a line of the invoice bills. A line raised from a subscription says
// which plan and dates it was (copied at invoicing time); an older line has
// only free text and an amount, from which the plan is worked out.
export function itemEnrolment(item: EnrolmentItem, courseNames: string[]): ItemEnrolment {
  const plan = item.plan ?? planForAmount(item.amount);
  const standard = plan && plan !== "CUSTOM" ? plan : null;
  const customDays = item.periodStart && item.periodEnd ? Math.round((item.periodEnd.getTime() - item.periodStart.getTime()) / 86_400_000) : 0;
  return {
    instrument: courseInDescription(item.description, courseNames),
    planLabel: plan ? `${PLAN_LABELS[plan]} enrolment` : null,
    classesLabel: standard && !/class/i.test(item.description) ? `${PLAN_CLASSES[standard]} classes` : null,
    validity: standard ? validityLabel(PLAN_DAYS[standard]) : customDays > 0 ? validityLabel(customDays) : null,
  };
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function wholeNumberInWords(n: number): string {
  if (n === 0) return "Zero";
  const units: [number, string][] = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1000, "Thousand"],
  ];
  const parts: string[] = [];
  for (const [size, name] of units) {
    if (n >= size) {
      parts.push(`${below1000(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(below1000(n));
  return parts.join(" ");
}

// "Rupees Twelve Thousand Six Hundred Eighty Only", in the Indian
// lakh/crore system, with paise when there are any.
export function amountInWords(amount: number): string {
  const paiseTotal = Math.round(Math.max(amount, 0) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const rupeeWords = `Rupees ${wholeNumberInWords(rupees)}`;
  return paise > 0 ? `${rupeeWords} and ${wholeNumberInWords(paise)} Paise Only` : `${rupeeWords} Only`;
}

// India-time dates for the printed invoice, whatever time zone the server is in.
export function invoiceDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month").slice(0, 3)} ${get("year")}`;
}

export function money(amount: number): string {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
