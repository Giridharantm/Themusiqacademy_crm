"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { parseDateOnly } from "@/lib/attendance";
import { istDateString } from "@/lib/whatsapp-notices";
import { canChangeExpense, canUseCategory, monthKey, validateExpense, type ExpenseRole } from "@/lib/expenses";

const METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"] as const;
type Method = (typeof METHODS)[number];

const back = (params: Record<string, string>) => `/admin/expenses?${new URLSearchParams(params).toString()}`;

function readEntry(formData: FormData) {
  const method = String(formData.get("method") ?? "CASH") as Method;
  return {
    amount: Number(formData.get("amount")),
    description: String(formData.get("description") ?? "").trim(),
    date: String(formData.get("date") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    payee: String(formData.get("payee") ?? "").trim() || null,
    reference: String(formData.get("reference") ?? "").trim() || null,
    method: (METHODS as readonly string[]).includes(method) ? method : ("CASH" as Method),
  };
}

function refresh() {
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports/pnl");
}

// Adds an expense. Front desk files petty cash under the petty-cash headings
// only; the admin may use any heading. Checked here, not just in the form.
export async function createExpense(formData: FormData) {
  const user = await requireRole("ADMIN", "FRONT_DESK");
  const role = user.role as ExpenseRole;
  const e = readEntry(formData);
  const today = istDateString(new Date());

  const problem = validateExpense(e, today);
  if (problem) redirect(back({ error: problem }));
  const category = await prisma.expenseCategory.findUnique({ where: { id: e.categoryId } });
  if (!category || !canUseCategory(role, category)) redirect(back({ error: "Choose one of the listed headings" }));

  await prisma.expense.create({
    data: {
      date: parseDateOnly(e.date),
      amount: e.amount,
      categoryId: category.id,
      description: e.description,
      payee: e.payee,
      method: e.method,
      reference: e.reference,
      source: role === "ADMIN" ? "ADMIN" : "PETTY_CASH",
      createdById: user.id,
    },
  });
  refresh();
  redirect(back({ month: e.date.slice(0, 7), saved: "1" }));
}

async function loadChangeable(id: string) {
  const user = await requireRole("ADMIN", "FRONT_DESK");
  const expense = await prisma.expense.findUnique({ where: { id }, include: { category: true } });
  if (!expense) redirect(back({ error: "That entry no longer exists" }));
  const allowed = canChangeExpense(
    user.role as ExpenseRole,
    { source: expense.source, createdById: expense.createdById, createdDay: istDateString(expense.createdAt) },
    user.id,
    istDateString(new Date())
  );
  if (!allowed) redirect(back({ error: expense.source === "PAYROLL" ? "Salary entries are changed from the payslip" : "You can't change that entry" }));
  return { user, expense };
}

export async function updateExpense(id: string, formData: FormData) {
  await requireRole("ADMIN", "FRONT_DESK");
  const { user, expense } = await loadChangeable(id);
  const e = readEntry(formData);
  const problem = validateExpense(e, istDateString(new Date()));
  if (problem) redirect(back({ error: problem }));
  // Keeping the entry's current heading is always fine, even if it was later switched off.
  const category = await prisma.expenseCategory.findUnique({ where: { id: e.categoryId } });
  const keeps = category?.id === expense.categoryId;
  if (!category || (!keeps && !canUseCategory(user.role as ExpenseRole, category))) redirect(back({ error: "Choose one of the listed headings" }));

  await prisma.expense.update({
    where: { id },
    data: { date: parseDateOnly(e.date), amount: e.amount, categoryId: category.id, description: e.description, payee: e.payee, method: e.method, reference: e.reference },
  });
  refresh();
  redirect(back({ month: e.date.slice(0, 7), saved: "1" }));
}

export async function deleteExpense(id: string) {
  await requireRole("ADMIN", "FRONT_DESK");
  const { expense } = await loadChangeable(id);
  await prisma.expense.delete({ where: { id } });
  refresh();
  redirect(back({ month: monthKey(expense.date.getFullYear(), expense.date.getMonth() + 1), saved: "1" }));
}

// ---- headings (admin) -------------------------------------------------------

export async function createExpenseCategory(formData: FormData) {
  await requireRole("ADMIN");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(back({ error: "Give the heading a name" }));
  if (await prisma.expenseCategory.findUnique({ where: { name } })) redirect(back({ error: "That heading already exists" }));
  const last = await prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
  await prisma.expenseCategory.create({ data: { name, pettyCash: formData.get("pettyCash") === "on", sortOrder: (last._max.sortOrder ?? 0) + 10 } });
  refresh();
  redirect(back({ saved: "1" }));
}

// Rename a heading, say whether front desk may use it, or switch it off (it
// stays on old entries, but can't be chosen for new ones). "Salaries" is what
// payroll files under, so it keeps its name and stays on.
export async function updateExpenseCategory(id: string, formData: FormData) {
  await requireRole("ADMIN");
  const category = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!category) redirect(back({ error: "That heading no longer exists" }));
  const locked = category.name === "Salaries";
  const name = locked ? category.name : String(formData.get("name") ?? "").trim();
  if (!name) redirect(back({ error: "Give the heading a name" }));
  const clash = await prisma.expenseCategory.findUnique({ where: { name } });
  if (clash && clash.id !== id) redirect(back({ error: "Another heading already has that name" }));
  await prisma.expenseCategory.update({
    where: { id },
    data: { name, pettyCash: locked ? false : formData.get("pettyCash") === "on", active: locked ? true : formData.get("active") === "on" },
  });
  refresh();
  redirect(back({ saved: "1" }));
}
