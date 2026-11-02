// Payslip arithmetic. Pure: the basic is the teacher's monthly salary, plus any
// extra earning lines (incentive, bonus...), less any deduction lines (TDS,
// advance recovered, leave cut...). Amounts are rupees, rounded to the paisa.

export type SlipLine = { label: string; amount: number; kind: "EARNING" | "DEDUCTION" };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function slipTotals(monthlySalary: number, lines: SlipLine[]) {
  const earnings = round2(lines.filter((l) => l.kind === "EARNING").reduce((s, l) => s + l.amount, 0));
  const deductions = round2(lines.filter((l) => l.kind === "DEDUCTION").reduce((s, l) => s + l.amount, 0));
  const gross = round2(monthlySalary + earnings);
  return { basic: round2(monthlySalary), earnings, gross, deductions, net: round2(gross - deductions) };
}

// Returns an error message, or null when a line is fine.
export function validateLine(label: string, amount: number): string | null {
  if (!label.trim()) return "Give the line a name";
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount above zero";
  if (amount > 10_000_000) return "That amount looks too large";
  return null;
}

// "XXXXXX1234": only the last four characters of an account number go on a slip.
export function maskAccount(account: string | null | undefined): string | null {
  const a = (account ?? "").replace(/\s+/g, "");
  if (!a) return null;
  return a.length <= 4 ? a : `${"X".repeat(Math.min(a.length - 4, 8))}${a.slice(-4)}`;
}

// A PAN is 5 letters, 4 digits, 1 letter. Stored upper-case.
export function normalisePan(pan: string): string | null {
  const p = pan.trim().toUpperCase();
  if (!p) return null;
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p) ? p : "INVALID";
}
