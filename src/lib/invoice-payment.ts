import { splitGst } from "@/lib/billing";
import { PLAN_INVOICE_AMOUNTS, type SubscriptionPlan } from "@/lib/subscription";

// Invoices are raised from a payment on a subscription (one invoice per
// subscription), starting from this moment. A subscription created before it
// is treated as already billed under the old, hand-made invoices, so the app
// doesn't offer a second invoice for it.
export const PAYMENT_INVOICES_FROM = new Date("2026-10-29T00:00:00+05:30");

// A subscription still waiting for its payment/invoice: current, started under
// the new rule, and not yet linked to an invoice.
export function needsInvoice(sub: { status: string; invoiceId: string | null; createdAt: Date }): boolean {
  return sub.status === "ACTIVE" && !sub.invoiceId && sub.createdAt >= PAYMENT_INVOICES_FROM;
}

// The package price (GST-inclusive, before discount): fixed per plan, entered
// by hand only for a CUSTOM package.
export function packagePrice(plan: SubscriptionPlan, customPrice: number): number {
  return plan === "CUSTOM" ? customPrice : PLAN_INVOICE_AMOUNTS[plan];
}

export type PaymentInvoice =
  | {
      ok: true;
      total: number;
      amountWithoutGst: number;
      cgstAmount: number;
      sgstAmount: number;
      balance: number;
      status: "PAID" | "PARTIAL";
    }
  | { ok: false; error: string };

// What the invoice raised by a first payment looks like: the total after
// discount with its GST split, and whether this payment settles it.
export function invoiceFromPayment({ price, discount, received }: { price: number; discount: number; received: number }): PaymentInvoice {
  if (!(price > 0)) return { ok: false, error: "The package price must be more than zero" };
  if (!(received > 0)) return { ok: false, error: "The amount received must be more than zero" };
  const total = Math.max(price - discount, 0);
  if (!(total > 0)) return { ok: false, error: "The discount can't be the whole fee" };
  if (received > total + 0.005) return { ok: false, error: "The amount received is more than the invoice total" };
  const balance = Math.max(total - received, 0);
  return { ok: true, total, ...splitGst(total), balance, status: balance < 0.005 ? "PAID" : "PARTIAL" };
}

// The invoice's single line: the instrument and what the package contains.
// Kept as plain text on purpose — the invoice is a fixed record, so later
// edits to the subscription (e.g. amending the bonus) must not rewrite it.
export function subscriptionInvoiceDescription(courseName: string, baseClasses: number, carryForwardClasses: number, bonusClasses: number): string {
  const parts = [`${baseClasses} classes`];
  if (carryForwardClasses > 0) parts.push(`${carryForwardClasses} carried forward`);
  if (bonusClasses > 0) parts.push(`${bonusClasses} bonus`);
  return `${courseName} - ${parts.join(" + ")}`;
}
