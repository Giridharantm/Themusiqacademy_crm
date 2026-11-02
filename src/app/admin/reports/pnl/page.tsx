import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { parseDateOnly } from "@/lib/attendance";
import { istDateString } from "@/lib/whatsapp-notices";
import { monthKey, monthLabel, monthRange, shiftMonth } from "@/lib/expenses";
import { buildPnl } from "@/lib/pnl";
import { money } from "@/lib/invoice";
import { Card, CardBody, CardHeader, PageHeader, StatCard, EmptyState } from "@/components/ui";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function ProfitAndLossPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const { year, month, key, from, to } = monthRange(sp.month, parseDateOnly(istDateString(new Date())));
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  // This month and the five before it, from one read of each table.
  const first = shiftMonth(year, month, -5);
  const windowStart = new Date(first.year, first.month - 1, 1);
  const [payments, expenses] = await Promise.all([
    prisma.payment.findMany({ where: { paidDate: { gte: windowStart, lt: to } }, select: { amount: true, paidDate: true } }),
    prisma.expense.findMany({ where: { date: { gte: windowStart, lt: to } }, select: { amount: true, date: true, category: { select: { name: true } } } }),
  ]);
  const rows = expenses.map((e) => ({ amount: e.amount, date: e.date, categoryName: e.category.name }));
  const pnl = buildPnl({ payments, expenses: rows, from, to });

  const trend = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(first.year, first.month, i);
    const p = buildPnl({ payments, expenses: rows, from: new Date(m.year, m.month - 1, 1), to: new Date(m.year, m.month, 1) });
    return { ...m, revenue: p.revenue, expenses: p.totalExpenses, profit: p.profit };
  }).reverse();

  return (
    <div>
      <PageHeader
        title="Profit & loss"
        subtitle="Income is the money received in the month with GST taken out (GST isn't the academy's income). Expenses are what was paid out in the month."
        action={
          <div className="flex items-center gap-3 text-sm">
            <Link href={`/admin/reports/pnl?month=${monthKey(prev.year, prev.month)}`} className="text-indigo-600 hover:underline">← {monthLabel(prev.year, prev.month)}</Link>
            <Link href={`/admin/reports/pnl?month=${monthKey(next.year, next.month)}`} className="text-indigo-600 hover:underline">{monthLabel(next.year, next.month)} →</Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label={`Income · ${monthLabel(year, month)}`} value={`₹ ${money(pnl.revenue)}`} hint={`Received ₹ ${money(pnl.received)}, less GST ₹ ${money(pnl.gstCollected)}`} />
        <StatCard label="Expenses" value={`₹ ${money(pnl.totalExpenses)}`} href={`/admin/expenses?month=${key}`} hint="See the entries" />
        <StatCard
          label={pnl.profit >= 0 ? "Profit" : "Loss"}
          value={`₹ ${money(Math.abs(pnl.profit))}`}
          hint={pnl.margin === null ? "No income recorded this month" : `${pct(pnl.margin)} of income`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Where the money went" subtitle={monthLabel(year, month)} />
          {pnl.categories.length === 0 ? (
            <CardBody>
              <EmptyState text="No expenses recorded for this month" />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pnl.categories.map((c) => (
                <li key={c.name} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-900">{c.name}</span>
                    <span className="tabular-nums">
                      ₹ {money(c.amount)} <span className="text-xs text-slate-400">{pct(c.share)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${Math.max(c.share * 100, 2)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Last six months" subtitle="Income, expenses and what was left" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-2 font-medium">Month</th>
                  <th className="px-2 py-2 font-medium text-right">Income</th>
                  <th className="px-2 py-2 font-medium text-right">Expenses</th>
                  <th className="px-5 py-2 font-medium text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((t) => (
                  <tr key={`${t.year}-${t.month}`} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2">
                      <Link href={`/admin/reports/pnl?month=${monthKey(t.year, t.month)}`} className="text-slate-900 hover:text-indigo-600">
                        {monthLabel(t.year, t.month)}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(t.revenue)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(t.expenses)}</td>
                    <td className={`px-5 py-2 text-right tabular-nums font-medium ${t.profit < 0 ? "text-red-700" : "text-emerald-700"}`}>{t.profit < 0 ? "−" : ""}{money(Math.abs(t.profit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
