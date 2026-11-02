import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { parseDateOnly } from "@/lib/attendance";
import { createExpense, createExpenseCategory, deleteExpense, updateExpense, updateExpenseCategory } from "@/lib/actions/expense-actions";
import { istDateString } from "@/lib/whatsapp-notices";
import { canChangeExpense, canUseCategory, monthKey, monthLabel, monthRange, shiftMonth, sumAmounts, type ExpenseRole } from "@/lib/expenses";
import { money } from "@/lib/invoice";
import { Card, CardBody, CardHeader, PageHeader, Badge, Button, Input, Select, EmptyState } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { format } from "date-fns";

const METHOD_LABELS: Record<string, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

function MethodOptions() {
  return (
    <>
      {Object.entries(METHOD_LABELS).map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </>
  );
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; cat?: string; error?: string; saved?: string }> }) {
  const user = await requireRole("ADMIN", "FRONT_DESK");
  const role = user.role as ExpenseRole;
  const isAdmin = role === "ADMIN";
  const sp = await searchParams;
  const today = istDateString(new Date());
  const { year, month, key, from, to } = monthRange(sp.month, parseDateOnly(today));
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const categories = await prisma.expenseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const usable = categories.filter((c) => canUseCategory(role, c));

  // Front desk sees petty cash only; the rent, salaries and the rest are the admin's.
  const expenses = await prisma.expense.findMany({
    where: {
      date: { gte: from, lt: to },
      ...(sp.cat ? { categoryId: sp.cat } : {}),
      ...(isAdmin ? {} : { source: "PETTY_CASH", category: { pettyCash: true } }),
    },
    include: { category: true, createdBy: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const total = sumAmounts(expenses);
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category.name, (byCategory.get(e.category.name) ?? 0) + e.amount);
  const breakdown = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
  const link = (m: { year: number; month: number }) => `/admin/expenses?month=${monthKey(m.year, m.month)}${sp.cat ? `&cat=${sp.cat}` : ""}`;

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Expenses" : "Petty cash"}
        subtitle={isAdmin ? "Everything the academy spends: rent, salaries, maintenance and petty cash. It feeds the monthly profit and loss." : "Record each small expense paid from the academy's cash: what it was for, how much, and who was paid."}
      />

      {sp.saved && <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">Saved.</p>}
      {sp.error && <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{sp.error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title={monthLabel(year, month)}
              subtitle={`${expenses.length} entr${expenses.length === 1 ? "y" : "ies"} · ₹ ${money(total)}`}
              action={
                <div className="flex items-center gap-3 text-sm">
                  <Link href={link(prev)} className="text-indigo-600 hover:underline">← {monthLabel(prev.year, prev.month)}</Link>
                  <Link href={link(next)} className="text-indigo-600 hover:underline">{monthLabel(next.year, next.month)} →</Link>
                </div>
              }
            />
            <CardBody className="border-b border-slate-100">
              <form method="get" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="month" value={key} />
                <label className="block">
                  <span className="block text-xs text-slate-500 mb-1">Heading</span>
                  <select name="cat" defaultValue={sp.cat ?? ""} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                    <option value="">All headings</option>
                    {(isAdmin ? categories : categories.filter((c) => c.pettyCash)).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="secondary">Filter</Button>
              </form>
              {breakdown.length > 1 && (
                <p className="mt-3 text-xs text-slate-500">{breakdown.map(([n, a]) => `${n} ₹ ${money(a)}`).join(" · ")}</p>
              )}
            </CardBody>

            {expenses.length === 0 ? (
              <CardBody>
                <EmptyState text="Nothing recorded for this month" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {expenses.map((e) => {
                  const changeable = canChangeExpense(role, { source: e.source, createdById: e.createdById, createdDay: istDateString(e.createdAt) }, user.id, today);
                  return (
                    <li key={e.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            {e.description} <span className="text-slate-400 font-normal">· {e.category.name}</span>
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {format(e.date, "EEE d MMM")} · {METHOD_LABELS[e.method]}
                            {e.payee ? ` · paid to ${e.payee}` : ""}
                            {e.reference ? ` · ref ${e.reference}` : ""}
                            {e.createdBy ? ` · entered by ${e.createdBy.name}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {e.source === "PAYROLL" && <Badge color="blue">Payroll</Badge>}
                          <span className="text-sm font-semibold tabular-nums">₹ {money(e.amount)}</span>
                        </div>
                      </div>
                      {changeable && (
                        <details className="mt-1.5" key={`${e.amount}-${e.description}-${e.categoryId}-${e.updatedAt.getTime()}`}>
                          <summary className="text-xs text-indigo-600 hover:underline cursor-pointer list-none">Edit or delete</summary>
                          <form action={updateExpense.bind(null, e.id)} className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                            <Input label="Date" name="date" type="date" required defaultValue={format(e.date, "yyyy-MM-dd")} max={today} />
                            <Input label="Total paid (₹)" name="amount" type="number" min="0.01" step="0.01" required defaultValue={e.amount} hint="Everything paid, GST included" />
                            <Select label="Heading" name="categoryId" defaultValue={e.categoryId}>
                              {(usable.some((c) => c.id === e.categoryId) ? usable : [e.category, ...usable]).map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </Select>
                            <Select label="Paid by" name="method" defaultValue={e.method}>
                              <MethodOptions />
                            </Select>
                            <div className="sm:col-span-2">
                              <Input label="What it was for" name="description" required defaultValue={e.description} />
                            </div>
                            <Input label="Paid to" name="payee" defaultValue={e.payee ?? ""} />
                            <Input label="Bill / reference no." name="reference" defaultValue={e.reference ?? ""} />
                            <div className="sm:col-span-2 flex items-center gap-3">
                              <Button type="submit" variant="secondary">Save changes</Button>
                            </div>
                          </form>
                          <form action={deleteExpense.bind(null, e.id)} className="mt-2">
                            <ConfirmSubmitButton confirmMessage="Delete this entry?">Delete entry</ConfirmSubmitButton>
                          </form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader title="Headings" subtitle="What expenses are filed under. Front desk can only use the ones marked petty cash." />
              <ul className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <li key={c.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-slate-900">
                        {c.name}
                        {!c.active && <span className="ml-2 text-xs text-slate-400">(switched off)</span>}
                      </p>
                      <div className="flex items-center gap-2">
                        {c.pettyCash && <Badge color="blue">Petty cash</Badge>}
                        <details key={`${c.name}-${c.pettyCash}-${c.active}`} className="text-xs">
                          <summary className="text-indigo-600 hover:underline cursor-pointer list-none">Edit</summary>
                          <form action={updateExpenseCategory.bind(null, c.id)} className="absolute right-6 z-10 mt-1 w-72 space-y-2 rounded-lg border border-line bg-white p-3 shadow-lg">
                            {c.name === "Salaries" ? (
                              <p className="text-slate-500">Salaries is where payslips are filed, so it can&apos;t be renamed or switched off.</p>
                            ) : (
                              <>
                                <Input label="Name" name="name" required defaultValue={c.name} />
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                  <input type="checkbox" name="pettyCash" defaultChecked={c.pettyCash} /> Front desk may use it (petty cash)
                                </label>
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                  <input type="checkbox" name="active" defaultChecked={c.active} /> In use
                                </label>
                                <Button type="submit" variant="secondary">Save</Button>
                              </>
                            )}
                          </form>
                        </details>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <CardBody className="border-t border-slate-100">
                <form action={createExpenseCategory} className="flex flex-wrap items-end gap-3">
                  <Input label="New heading" name="name" required placeholder="e.g. Recital costs" />
                  <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                    <input type="checkbox" name="pettyCash" /> Front desk may use it
                  </label>
                  <Button type="submit" variant="secondary">Add heading</Button>
                </form>
              </CardBody>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title={isAdmin ? "Add an expense" : "Add petty cash"} subtitle="Cash basis: use the date it was paid" />
          <CardBody>
            <form action={createExpense} className="space-y-3">
              <Input label="Date paid" name="date" type="date" required defaultValue={today} max={today} />
              <Input label="Total paid (₹)" name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" hint="Everything you paid, including any GST. No split needed." />
              <Select label="Heading" name="categoryId" required defaultValue="">
                <option value="" disabled>Choose a heading</option>
                {usable.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Input label="What it was for" name="description" required placeholder="e.g. Tea and biscuits for parents' meeting" />
              <Input label="Paid to (optional)" name="payee" placeholder="Shop, vendor or person" />
              <Select label="Paid by" name="method" defaultValue="CASH">
                <MethodOptions />
              </Select>
              <Input label="Bill / reference no. (optional)" name="reference" />
              <Button type="submit" className="w-full">Save entry</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
