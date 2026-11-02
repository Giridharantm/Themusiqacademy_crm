// The monthly profit and loss, on a cash basis: income is the money received in
// the month (GST taken out, since GST isn't the academy's income), and
// expenses are what was paid out in the month. Pure.
import { splitGst } from "@/lib/billing";

export type PnlPayment = { amount: number; paidDate: Date };
export type PnlExpense = { amount: number; date: Date; categoryName: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildPnl(input: { payments: PnlPayment[]; expenses: PnlExpense[]; from: Date; to: Date }) {
  const inMonth = <T extends { amount: number }>(rows: T[], when: (r: T) => Date) => rows.filter((r) => when(r) >= input.from && when(r) < input.to);

  const received = round2(inMonth(input.payments, (p) => p.paidDate).reduce((s, p) => s + p.amount, 0));
  const gst = splitGst(received);
  const revenue = round2(gst.amountWithoutGst);
  const gstCollected = round2(received - revenue);

  const spent = inMonth(input.expenses, (e) => e.date);
  const byCategory = new Map<string, number>();
  for (const e of spent) byCategory.set(e.categoryName, (byCategory.get(e.categoryName) ?? 0) + e.amount);
  const totalExpenses = round2(spent.reduce((s, e) => s + e.amount, 0));
  const categories = Array.from(byCategory.entries())
    .map(([name, amount]) => ({ name, amount: round2(amount), share: totalExpenses > 0 ? amount / totalExpenses : 0 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  const profit = round2(revenue - totalExpenses);
  return { received, revenue, gstCollected, totalExpenses, categories, profit, margin: revenue > 0 ? profit / revenue : null };
}
