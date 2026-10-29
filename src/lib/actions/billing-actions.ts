"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DISCOUNT_STEPS } from "@/lib/subscription";
import { invoiceFromPayment, needsInvoice, packagePrice, subscriptionInvoiceDescription } from "@/lib/invoice-payment";

const ALLOWED_DISCOUNTS = new Set<number>([0, ...DISCOUNT_STEPS]);
const PAYMENT_METHODS = ["CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const asMethod = (raw: string): PaymentMethod => ((PAYMENT_METHODS as readonly string[]).includes(raw) ? (raw as PaymentMethod) : "CASH");

// Derived from the highest existing number, not a row count — see the same
// fix (and the reasoning) in nextStudentCode().
async function nextInvoiceNumber(db: Prisma.TransactionClient) {
  const [row] = await db.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("invoiceNumber" FROM 5) AS INTEGER)) AS max
    FROM "Invoice"
    WHERE "invoiceNumber" ~ '^INV-[0-9]+$'
  `;
  return `INV-${String((row?.max ?? 0) + 1).padStart(4, "0")}`;
}

// The only way an invoice is raised: recording the first payment on a
// subscription. The invoice is created from that payment (so there is never an
// invoice without money behind it) and linked to the subscription, which can
// carry one invoice only — that link is unique in the database, so a second
// invoice for the same subscription is impossible even on a double-click or
// from two browser tabs. A payment smaller than the total leaves a balance,
// which is then settled with "Record payment" on the invoice.
export async function recordSubscriptionPayment(subscriptionId: string, studentId: string, formData: FormData) {
  await requireRole("ADMIN");

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { course: true, bonusGrants: true },
  });
  if (!subscription || subscription.studentId !== studentId) throw new Error("Subscription not found");
  if (!needsInvoice(subscription)) throw new Error("This subscription already has an invoice, or isn't open for billing");

  const discount = Number(formData.get("discount") ?? 0);
  if (!ALLOWED_DISCOUNTS.has(discount)) throw new Error("Invalid discount amount");

  const price = packagePrice(subscription.plan, Number(formData.get("price") ?? 0));
  const received = Number(formData.get("amount") ?? 0);
  const method = asMethod(String(formData.get("method") ?? "CASH"));
  const note = String(formData.get("note") ?? "").trim() || null;

  const result = invoiceFromPayment({ price, discount, received });
  if (!result.ok) throw new Error(result.error);

  const now = new Date();
  let dueDate = now;
  if (result.balance > 0) {
    const raw = String(formData.get("balanceDueBy") ?? "");
    if (!raw) throw new Error("Say when the balance is due");
    dueDate = new Date(raw);
  }

  const bonusClasses = subscription.bonusGrants.reduce((sum, g) => sum + g.classes, 0);
  const description = subscriptionInvoiceDescription(subscription.course.name, subscription.baseClasses, subscription.carryForwardClasses, bonusClasses);

  let invoiceId: string | null = null;
  for (let attempt = 0; attempt < 3 && !invoiceId; attempt++) {
    try {
      invoiceId = await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: await nextInvoiceNumber(tx),
            studentId,
            issueDate: now,
            dueDate,
            periodStart: subscription.startDate,
            periodEnd: subscription.endDate,
            discount,
            amountWithoutGst: result.amountWithoutGst,
            cgstAmount: result.cgstAmount,
            sgstAmount: result.sgstAmount,
            total: result.total,
            status: result.status,
            items: { create: [{ description, amount: price }] },
            payments: { create: [{ amount: received, method, note, paidDate: now }] },
          },
        });
        // Claims the subscription only if nobody else has — if this loses the
        // race, the whole invoice is rolled back.
        const claimed = await tx.subscription.updateMany({ where: { id: subscriptionId, invoiceId: null }, data: { invoiceId: invoice.id } });
        if (claimed.count !== 1) throw new Error("This subscription already has an invoice");
        return invoice.id;
      });
    } catch (err) {
      // Two invoices raised at the same instant can pick the same number: try again.
      const numberClash = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && String(err.meta?.target).includes("invoiceNumber");
      if (!numberClash) throw err;
    }
  }
  if (!invoiceId) throw new Error("Couldn't raise the invoice, please try again");

  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath(`/parent/students/${studentId}`);
  revalidatePath("/admin/reports/invoices");
  redirect(`/admin/billing/${invoiceId}`);
}

// Records a further payment on an existing invoice (the balance of a part
// payment, or an older invoice that was raised before any money came in).
export async function recordPayment(invoiceId: string, formData: FormData) {
  await requireRole("ADMIN");

  const amount = Number(formData.get("amount") ?? 0);
  const method = asMethod(String(formData.get("method") ?? "CASH"));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!(amount > 0)) throw new Error("Payment amount must be greater than zero");

  const existing = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!existing) throw new Error("Invoice not found");
  if (existing.status === "CANCELLED") throw new Error("This invoice is cancelled");
  const balance = existing.total - existing.payments.reduce((sum, p) => sum + p.amount, 0);
  if (amount > balance + 0.005) throw new Error("That is more than the balance due on this invoice");

  await prisma.payment.create({ data: { invoiceId, amount, method, note } });

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (invoice) {
    const paidTotal = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const status = paidTotal >= invoice.total - 0.005 ? "PAID" : paidTotal > 0 ? "PARTIAL" : "PENDING";
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
  }

  revalidatePath(`/admin/billing/${invoiceId}`);
  revalidatePath("/admin/billing");
  revalidatePath("/admin");
}

// Voids the invoice and frees its subscription, so the correct payment can be
// recorded on it and a fresh invoice raised.
export async function cancelInvoice(invoiceId: string) {
  await requireRole("ADMIN");
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { studentId: true } });
  await prisma.$transaction([
    prisma.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED" } }),
    prisma.subscription.updateMany({ where: { invoiceId }, data: { invoiceId: null } }),
  ]);
  revalidatePath(`/admin/billing/${invoiceId}`);
  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  revalidatePath("/admin/reports/invoices");
  if (invoice) revalidatePath(`/admin/students/${invoice.studentId}`);
}

// Removes an invoice outright — for one raised by mistake (a double-click
// duplicate, the wrong student picked). Refuses once a payment is recorded
// against it: at that point it's real history, and "Cancel" (which keeps
// the row, just marks it void) is the correct way to void it instead.
export async function deleteInvoice(invoiceId: string) {
  await requireRole("ADMIN");

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!invoice) return;
  if (invoice.payments.length > 0) {
    throw new Error("Can't delete an invoice with a recorded payment — cancel it instead.");
  }

  await prisma.invoice.delete({ where: { id: invoiceId } });
  revalidatePath("/admin/billing");
  redirect("/admin/billing");
}
