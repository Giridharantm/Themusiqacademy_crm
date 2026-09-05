"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PLAN_INVOICE_AMOUNTS, DISCOUNT_STEPS } from "@/lib/subscription";
import { splitGst } from "@/lib/billing";

const ALLOWED_ITEM_AMOUNTS = new Set<number>(Object.values(PLAN_INVOICE_AMOUNTS));
const ALLOWED_DISCOUNTS = new Set<number>([0, ...DISCOUNT_STEPS]);

// Derived from the highest existing number, not a row count — see the same
// fix (and the reasoning) in nextStudentCode().
async function nextInvoiceNumber() {
  const [row] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("invoiceNumber" FROM 5) AS INTEGER)) AS max
    FROM "Invoice"
    WHERE "invoiceNumber" ~ '^INV-[0-9]+$'
  `;
  return `INV-${String((row?.max ?? 0) + 1).padStart(4, "0")}`;
}

export async function createInvoice(formData: FormData) {
  await requireRole("ADMIN");

  const studentId = String(formData.get("studentId") ?? "");
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const periodStartRaw = String(formData.get("periodStart") ?? "");
  const periodEndRaw = String(formData.get("periodEnd") ?? "");
  const discount = Number(formData.get("discount") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!ALLOWED_DISCOUNTS.has(discount)) throw new Error("Invalid discount amount");

  const descriptions = formData.getAll("itemDescription").map(String);
  const amounts = formData.getAll("itemAmount").map(Number);

  if (!studentId || !dueDateRaw || descriptions.length === 0) {
    throw new Error("Student, due date and at least one line item are required");
  }

  const items = descriptions
    .map((description, i) => ({ description, amount: amounts[i] || 0 }))
    .filter((item) => item.description && item.amount > 0);

  if (items.length === 0) throw new Error("At least one valid line item is required");
  if (items.some((item) => !ALLOWED_ITEM_AMOUNTS.has(item.amount))) {
    throw new Error("Invalid line item amount");
  }

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const total = Math.max(subtotal - discount, 0);
  const { amountWithoutGst, cgstAmount, sgstAmount } = splitGst(total);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: await nextInvoiceNumber(),
      studentId,
      dueDate: new Date(dueDateRaw),
      periodStart: periodStartRaw ? new Date(periodStartRaw) : null,
      periodEnd: periodEndRaw ? new Date(periodEndRaw) : null,
      discount,
      amountWithoutGst,
      cgstAmount,
      sgstAmount,
      total,
      notes,
      status: "PENDING",
      items: { create: items },
    },
  });

  revalidatePath("/admin/billing");
  redirect(`/admin/billing/${invoice.id}`);
}

export async function recordPayment(invoiceId: string, formData: FormData) {
  await requireRole("ADMIN");

  const amount = Number(formData.get("amount") ?? 0);
  const method = String(formData.get("method") ?? "CASH") as "CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "OTHER";
  const note = String(formData.get("note") ?? "").trim() || null;

  if (amount <= 0) throw new Error("Payment amount must be greater than zero");

  await prisma.payment.create({ data: { invoiceId, amount, method, note } });

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (invoice) {
    const paidTotal = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const status = paidTotal >= invoice.total ? "PAID" : paidTotal > 0 ? "PARTIAL" : "PENDING";
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
  }

  revalidatePath(`/admin/billing/${invoiceId}`);
  revalidatePath("/admin/billing");
}

export async function cancelInvoice(invoiceId: string) {
  await requireRole("ADMIN");
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED" } });
  revalidatePath(`/admin/billing/${invoiceId}`);
  revalidatePath("/admin/billing");
}
