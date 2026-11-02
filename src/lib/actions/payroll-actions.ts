"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { parseDateOnly } from "@/lib/attendance";
import { istDateString } from "@/lib/whatsapp-notices";
import { monthKey, monthLabel } from "@/lib/expenses";
import { normalisePan, slipTotals, validateLine } from "@/lib/payroll";

const METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

const payrollHome = (params: Record<string, string>) => `/admin/payroll?${new URLSearchParams(params).toString()}`;
const slipPage = (id: string, error?: string) => `/admin/payroll/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`;

function refresh(payslipId?: string) {
  revalidatePath("/admin/payroll");
  if (payslipId) revalidatePath(`/admin/payroll/${payslipId}`);
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports/pnl");
  revalidatePath("/teacher/payslips");
}

type Db = Prisma.TransactionClient | typeof prisma;

// Keeps the stored net pay in step with the slip's lines.
async function recomputeNet(db: Db, payslipId: string) {
  const slip = await db.payslip.findUniqueOrThrow({ where: { id: payslipId }, include: { lines: true } });
  const net = slipTotals(slip.monthlySalary, slip.lines).net;
  await db.payslip.update({ where: { id: payslipId }, data: { netPay: net } });
  return net;
}

// A teacher's fixed monthly pay and the details printed on their slip.
export async function setTeacherPay(teacherId: string, formData: FormData) {
  await requireRole("ADMIN");
  const teacher = await prisma.user.findUnique({ where: { id: teacherId } });
  if (!teacher || teacher.role !== "TEACHER") redirect(payrollHome({ error: "That isn't a teacher" }));

  const salary = Number(formData.get("monthlySalary"));
  if (!Number.isFinite(salary) || salary < 0 || salary > 10_000_000) redirect(payrollHome({ error: "Enter the monthly salary in rupees" }));
  const pan = normalisePan(String(formData.get("pan") ?? ""));
  if (pan === "INVALID") redirect(payrollHome({ error: "A PAN has 5 letters, 4 digits and 1 letter, like ABCDE1234F" }));
  const joinedRaw = String(formData.get("joinedOn") ?? "");

  const data = {
    monthlySalary: salary,
    designation: String(formData.get("designation") ?? "").trim() || null,
    pan,
    bankAccount: String(formData.get("bankAccount") ?? "").replace(/\s+/g, "") || null,
    joinedOn: /^\d{4}-\d{2}-\d{2}$/.test(joinedRaw) ? parseDateOnly(joinedRaw) : null,
  };
  await prisma.teacherPay.upsert({ where: { userId: teacherId }, create: { userId: teacherId, ...data }, update: data });
  refresh();
  redirect(payrollHome({ month: String(formData.get("month") ?? ""), saved: "1" }));
}

// Starts a slip for a teacher and month, copying their current monthly salary.
// If one already exists it just opens it.
export async function createPayslip(teacherId: string, year: number, month: number) {
  const user = await requireRole("ADMIN");
  const pay = await prisma.teacherPay.findUnique({ where: { userId: teacherId } });
  if (!pay) redirect(payrollHome({ month: monthKey(year, month), error: "Set this teacher's monthly salary first" }));

  const existing = await prisma.payslip.findUnique({ where: { teacherId_year_month: { teacherId, year, month } } });
  if (existing) redirect(slipPage(existing.id));

  const slip = await prisma.payslip.create({
    data: { teacherId, year, month, monthlySalary: pay.monthlySalary, netPay: pay.monthlySalary, generatedById: user.id },
  });
  refresh(slip.id);
  redirect(slipPage(slip.id));
}

async function draftSlip(id: string) {
  await requireRole("ADMIN");
  const slip = await prisma.payslip.findUnique({ where: { id } });
  if (!slip) redirect(payrollHome({ error: "That slip no longer exists" }));
  if (slip.status !== "DRAFT") redirect(slipPage(id, "This slip is finalised. Reopen it to change it."));
  return slip;
}

// The basic for this month (say a part month) and a note shown on the slip.
export async function updatePayslipDetails(id: string, formData: FormData) {
  await requireRole("ADMIN");
  await draftSlip(id);
  const basic = Number(formData.get("monthlySalary"));
  if (!Number.isFinite(basic) || basic < 0 || basic > 10_000_000) redirect(slipPage(id, "Enter the basic for this month in rupees"));
  await prisma.payslip.update({ where: { id }, data: { monthlySalary: basic, note: String(formData.get("note") ?? "").trim() || null } });
  await recomputeNet(prisma, id);
  refresh(id);
  redirect(slipPage(id));
}

export async function addPayslipLine(id: string, formData: FormData) {
  await requireRole("ADMIN");
  await draftSlip(id);
  const label = String(formData.get("label") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const kind = formData.get("kind") === "DEDUCTION" ? "DEDUCTION" : "EARNING";
  const problem = validateLine(label, amount);
  if (problem) redirect(slipPage(id, problem));
  await prisma.payslipLine.create({ data: { payslipId: id, label, amount, kind } });
  await recomputeNet(prisma, id);
  refresh(id);
  redirect(slipPage(id));
}

export async function removePayslipLine(lineId: string) {
  await requireRole("ADMIN");
  const line = await prisma.payslipLine.findUnique({ where: { id: lineId }, include: { payslip: true } });
  if (!line) redirect(payrollHome({ error: "That line no longer exists" }));
  if (line.payslip.status !== "DRAFT") redirect(slipPage(line.payslipId, "This slip is finalised. Reopen it to change it."));
  await prisma.payslipLine.delete({ where: { id: lineId } });
  await recomputeNet(prisma, line.payslipId);
  refresh(line.payslipId);
  redirect(slipPage(line.payslipId));
}

// Finalising makes the slip visible to the teacher and files the net pay as a
// "Salaries" expense on the pay date, so it lands in that month's P&L.
export async function finalisePayslip(id: string, formData: FormData) {
  const user = await requireRole("ADMIN");
  const slip = await draftSlip(id);
  const paidRaw = String(formData.get("paidOn") ?? "") || istDateString(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidRaw)) redirect(slipPage(id, "Pick the date the salary was paid"));
  const method = METHODS.includes(String(formData.get("method"))) ? String(formData.get("method")) : "BANK_TRANSFER";

  const teacher = await prisma.user.findUniqueOrThrow({ where: { id: slip.teacherId } });
  await prisma.$transaction(async (tx) => {
    const net = await recomputeNet(tx, id);
    if (net <= 0) throw new Error("NOTHING_TO_PAY");
    const category =
      (await tx.expenseCategory.findUnique({ where: { name: "Salaries" } })) ??
      (await tx.expenseCategory.create({ data: { name: "Salaries", pettyCash: false, sortOrder: 20 } }));
    await tx.expense.create({
      data: {
        date: parseDateOnly(paidRaw),
        amount: net,
        categoryId: category.id,
        description: `Salary for ${monthLabel(slip.year, slip.month)}`,
        payee: teacher.name,
        method: method as "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER",
        source: "PAYROLL",
        payslipId: id,
        createdById: user.id,
      },
    });
    await tx.payslip.update({ where: { id }, data: { status: "FINAL", paidOn: parseDateOnly(paidRaw), finalisedAt: new Date() } });
  }).catch((e) => {
    if (e instanceof Error && e.message === "NOTHING_TO_PAY") redirect(slipPage(id, "The net pay is zero or less, so there is nothing to pay"));
    throw e;
  });
  refresh(id);
  redirect(slipPage(id));
}

// Takes a finalised slip back to a draft, so it can be corrected: it disappears
// from the teacher and its salary entry is removed from the books until it is
// finalised again.
export async function reopenPayslip(id: string) {
  await requireRole("ADMIN");
  const slip = await prisma.payslip.findUnique({ where: { id } });
  if (!slip) redirect(payrollHome({ error: "That slip no longer exists" }));
  await prisma.$transaction([
    prisma.expense.deleteMany({ where: { payslipId: id } }),
    prisma.payslip.update({ where: { id }, data: { status: "DRAFT", paidOn: null, finalisedAt: null } }),
  ]);
  refresh(id);
  redirect(slipPage(id));
}

export async function deletePayslip(id: string) {
  await requireRole("ADMIN");
  const slip = await draftSlip(id);
  await prisma.payslip.delete({ where: { id } });
  refresh();
  redirect(payrollHome({ month: monthKey(slip.year, slip.month) }));
}
