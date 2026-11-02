// Rules for the academy's expenses: which headings front desk may use, who may
// change an entry, and the month windows the reports work in. Pure.

export type ExpenseRole = "ADMIN" | "FRONT_DESK";

// "2026-11" -> the month as a date range [from, to). Anything that isn't a valid
// yyyy-mm falls back to the month of `fallback`.
export function monthRange(key: string | undefined, fallback: Date): { key: string; from: Date; to: Date; year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(key ?? "");
  let year = fallback.getFullYear();
  let month = fallback.getMonth() + 1;
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    year = Number(m[1]);
    month = Number(m[2]);
  }
  return { key: monthKey(year, month), from: new Date(year, month - 1, 1), to: new Date(year, month, 1), year, month };
}

export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

// "November 2026"
export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
}

// The month before / after a yyyy-mm key.
export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// Front desk files only under the petty-cash headings; the admin may use any.
export function canUseCategory(role: ExpenseRole, category: { pettyCash: boolean; active: boolean }): boolean {
  if (!category.active) return false;
  return role === "ADMIN" || category.pettyCash;
}

// Payroll entries are made by finalising a payslip, so nobody edits them by hand.
// The admin may change anything else. Front desk may fix only their own petty
// cash entry, and only on the day they entered it.
export function canChangeExpense(
  role: ExpenseRole,
  expense: { source: "PETTY_CASH" | "ADMIN" | "PAYROLL"; createdById: string | null; createdDay: string },
  userId: string,
  today: string
): boolean {
  if (expense.source === "PAYROLL") return false;
  if (role === "ADMIN") return true;
  return expense.source === "PETTY_CASH" && expense.createdById === userId && expense.createdDay === today;
}

export type ExpenseInput = { amount: number; description: string; date: string };

// Returns an error message, or null when the entry is fine.
export function validateExpense(input: { amount: number; description: string; date: string }, today: string): string | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Enter the amount paid";
  if (input.amount > 10_000_000) return "That amount looks too large";
  if (!input.description.trim()) return "Say what it was for";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "Pick the date it was paid";
  if (input.date > today) return "The date can't be in the future";
  return null;
}

export function sumAmounts(rows: { amount: number }[]): number {
  return Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
}
