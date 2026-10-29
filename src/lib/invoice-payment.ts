import { splitGst } from "@/lib/billing";
import { PLAN_CLASSES, PLAN_DAYS, PLAN_INVOICE_AMOUNTS, addDays, type SubscriptionPlan } from "@/lib/subscription";

export type PackagePlan = Exclude<SubscriptionPlan, "CUSTOM">;

export const PACKAGE_PLANS = Object.keys(PLAN_INVOICE_AMOUNTS) as PackagePlan[];

export function isPackagePlan(value: string): value is PackagePlan {
  return (PACKAGE_PLANS as string[]).includes(value);
}

// Money is received first and invoiced afterwards: a payment says what it is
// for (instrument, package, start date, discount given), and an invoice is
// then raised against one or more of a student's payments.

// Why this payment can't be saved, or null when it can: the package's list
// price (GST-inclusive) less the discount is what it should cost, and the
// amount received can be that or, for a part payment, less.
export function checkPayment({ plan, discount, amount }: { plan: PackagePlan; discount: number; amount: number }): string | null {
  const gross = PLAN_INVOICE_AMOUNTS[plan];
  if (!(discount >= 0)) return "The discount can't be negative";
  if (discount >= gross) return "The discount can't be the whole fee";
  if (!(amount > 0)) return "The amount received must be more than zero";
  if (amount > gross - discount + 0.005) return "The amount received is more than the fee after discount";
  return null;
}

export type InvoiceFromPayments =
  | {
      ok: true;
      gross: number;
      discount: number;
      total: number;
      amountWithoutGst: number;
      cgstAmount: number;
      sgstAmount: number;
      received: number;
      balance: number;
      status: "PAID" | "PARTIAL";
    }
  | { ok: false; error: string };

// What an invoice raised against these payments looks like: the fee after
// discount for every package, with its GST split, settled by the money that was
// actually received. Anything short of the full fee stays as a balance.
export function invoiceFromPayments(payments: { plan: PackagePlan; discount: number; amount: number }[]): InvoiceFromPayments {
  if (payments.length === 0) return { ok: false, error: "Pick at least one payment to invoice" };
  for (const p of payments) {
    const problem = checkPayment(p);
    if (problem) return { ok: false, error: problem };
  }
  const gross = payments.reduce((sum, p) => sum + PLAN_INVOICE_AMOUNTS[p.plan], 0);
  const discount = payments.reduce((sum, p) => sum + p.discount, 0);
  const total = gross - discount;
  const received = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = Math.max(total - received, 0);
  return { ok: true, gross, discount, total, ...splitGst(total), received, balance, status: balance < 0.005 ? "PAID" : "PARTIAL" };
}

// The invoice line for a package: the instrument and the classes it holds.
// Plain text on purpose — the invoice is a fixed record.
export function packageDescription(courseName: string, plan: PackagePlan): string {
  return `${courseName} - ${PLAN_CLASSES[plan]} classes`;
}

// When a package starting on this date runs out (same rule as a subscription).
export function packageEnd(startDate: Date, plan: PackagePlan): Date {
  return addDays(startDate, PLAN_DAYS[plan]);
}
