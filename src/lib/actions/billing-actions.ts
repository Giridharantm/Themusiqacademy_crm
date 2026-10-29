"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PLAN_INVOICE_AMOUNTS } from "@/lib/subscription";
import { checkPayment, invoiceFromPayments, isPackagePlan, packageDescription, packageEnd, type PackagePlan } from "@/lib/invoice-payment";
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

// Records money received from a student, with what it is for: the instrument,
// the package, when it starts, the discount given and how it was paid. No
// invoice yet — that is raised afterwards, against the payment
// (raiseInvoiceFromPayments).
export async function recordStudentPayment(studentId: string, formData: FormData) {
  await requireRole("ADMIN");

  const courseId = String(formData.get("courseId") ?? "");
  const rawPlan = String(formData.get("plan") ?? "");
  const startRaw = String(formData.get("startDate") ?? "");
  if (!courseId || !isPackagePlan(rawPlan) || !startRaw) throw new Error("Instrument, package and start date are required");
  const plan = rawPlan;

  const [student, course] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { id: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }),
  ]);
  if (!student || !course) throw new Error("Student or instrument not found");

  const startDate = new Date(startRaw);
  startDate.setHours(0, 0, 0, 0);
  const discount = Number(formData.get("discount") ?? 0) || 0;
  const amount = Number(formData.get("amount") ?? 0);
  const problem = checkPayment({ plan, discount, amount });
  if (problem) throw new Error(problem);

  // One payment per package: further instalments go on its invoice, so the same
  // package can never be invoiced twice.
  const existing = await prisma.payment.findFirst({
    where: { studentId, courseId, plan, startDate, OR: [{ invoiceId: null }, { invoice: { status: { not: "CANCELLED" } } }] },
    include: { invoice: { select: { invoiceNumber: true } } },
  });
  if (existing) {
    throw new Error(
      existing.invoice
        ? `This package already has a payment and invoice (${existing.invoice.invoiceNumber}) — record any further payment on that invoice`
        : "This package already has a payment recorded — raise its invoice, then record any further payment on the invoice"
    );
  }

  await prisma.payment.create({
    data: {
      studentId,
      courseId,
      plan,
      startDate,
      discount,
      amount,
      method: asMethod(String(formData.get("method") ?? "CASH")),
      reference: String(formData.get("reference") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
    },
  });

  revalidatePath(`/admin/students/${studentId}`);
}

// Raises an invoice against some of one student's payments: one line per
// payment, the fee after discount as the total, the payments as what has been
// paid (any shortfall stays as a balance). A payment can sit on one invoice
// only — it is claimed inside the same transaction, so a double-click or a
// second tab can't invoice it twice. Several payments (a year paid at once,
// split over two instruments) become one invoice.
export async function raiseInvoiceFromPayments(studentId: string, formData: FormData) {
  await requireRole("ADMIN");

  const ids = Array.from(new Set(formData.getAll("paymentId").map(String)));
  if (ids.length === 0) throw new Error("Pick at least one payment to invoice");

  const payments = await prisma.payment.findMany({
    where: { id: { in: ids }, studentId, invoiceId: null, plan: { not: null }, startDate: { not: null } },
    include: { course: { select: { name: true } } },
    orderBy: { paidDate: "asc" },
  });
  if (payments.length !== ids.length) throw new Error("A selected payment is already invoiced, or isn't this student's");

  const lines = payments.map((p) => ({ p, plan: p.plan as PackagePlan, start: p.startDate as Date }));
  const result = invoiceFromPayments(lines.map((l) => ({ plan: l.plan, discount: l.p.discount, amount: l.p.amount })));
  if (!result.ok) throw new Error(result.error);

  const now = new Date();
  let dueDate = now;
  if (result.balance > 0) {
    const raw = String(formData.get("balanceDueBy") ?? "");
    if (!raw) throw new Error("Say when the balance is due");
    dueDate = new Date(raw);
  }

  const items = lines.map(({ p, plan, start }) => ({
    description: packageDescription(p.course?.name ?? "Music class", plan),
    amount: PLAN_INVOICE_AMOUNTS[plan],
    plan,
    periodStart: start,
    periodEnd: packageEnd(start, plan),
  }));
  const invoiceNote = String(formData.get("invoiceNote") ?? "").trim() || null;

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
            periodStart: new Date(Math.min(...items.map((i) => i.periodStart.getTime()))),
            periodEnd: new Date(Math.max(...items.map((i) => i.periodEnd.getTime()))),
            discount: result.discount,
            amountWithoutGst: result.amountWithoutGst,
            cgstAmount: result.cgstAmount,
            sgstAmount: result.sgstAmount,
            total: result.total,
            status: result.status,
            notes: invoiceNote,
            items: { create: items },
          },
        });
        // Claims the payments only if nobody else has — if this loses the
        // race, the whole invoice is rolled back.
        const claimed = await tx.payment.updateMany({ where: { id: { in: ids }, invoiceId: null }, data: { invoiceId: invoice.id } });
        if (claimed.count !== ids.length) throw new Error("A selected payment is already invoiced");
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
  const reference = String(formData.get("reference") ?? "").trim() || null;

  if (!(amount > 0)) throw new Error("Payment amount must be greater than zero");

  const existing = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!existing) throw new Error("Invoice not found");
  if (existing.status === "CANCELLED") throw new Error("This invoice is cancelled");
  const balance = existing.total - existing.payments.reduce((sum, p) => sum + p.amount, 0);
  if (amount > balance + 0.005) throw new Error("That is more than the balance due on this invoice");

  await prisma.payment.create({ data: { invoiceId, studentId: existing.studentId, amount, method, note, reference } });

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

// Voids the invoice and frees its payments, so a correct invoice can be raised
// against them.
export async function cancelInvoice(invoiceId: string) {
  await requireRole("ADMIN");
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { studentId: true } });
  await prisma.$transaction([
    prisma.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED" } }),
    // Payments recorded from the student page go back to "not invoiced" so the
    // right invoice can be raised against them; older payments stay as history.
    prisma.payment.updateMany({ where: { invoiceId, plan: { not: null } }, data: { invoiceId: null } }),
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
