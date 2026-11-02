import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { parseDateOnly } from "@/lib/attendance";
import { createPayslip, setTeacherPay } from "@/lib/actions/payroll-actions";
import { istDateString } from "@/lib/whatsapp-notices";
import { monthKey, monthLabel, monthRange, shiftMonth } from "@/lib/expenses";
import { maskAccount } from "@/lib/payroll";
import { money } from "@/lib/invoice";
import { Card, CardBody, CardHeader, PageHeader, Badge, Button, Input, EmptyState } from "@/components/ui";
import { format } from "date-fns";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string; error?: string; saved?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const { year, month, key } = monthRange(sp.month, parseDateOnly(istDateString(new Date())));
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER" },
    include: { teacherPay: true, payslips: { where: { year, month } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const slips = teachers.flatMap((t) => t.payslips);
  const finalised = slips.filter((s) => s.status === "FINAL");
  const paidOut = finalised.reduce((s, x) => s + x.netPay, 0);

  return (
    <div>
      <PageHeader title="Payroll" subtitle="Each teacher's monthly salary and their payslip. A finalised payslip shows up for the teacher and is counted as that month's salary expense." />

      {sp.saved && <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">Saved.</p>}
      {sp.error && <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{sp.error}</p>}

      <Card>
        <CardHeader
          title={monthLabel(year, month)}
          subtitle={`${finalised.length} of ${teachers.filter((t) => t.status === "ACTIVE").length} active teachers paid · ₹ ${money(paidOut)} salary this month`}
          action={
            <div className="flex items-center gap-3 text-sm">
              <Link href={`/admin/payroll?month=${monthKey(prev.year, prev.month)}`} className="text-indigo-600 hover:underline">← {monthLabel(prev.year, prev.month)}</Link>
              <Link href={`/admin/payroll?month=${monthKey(next.year, next.month)}`} className="text-indigo-600 hover:underline">{monthLabel(next.year, next.month)} →</Link>
            </div>
          }
        />
        {teachers.length === 0 ? (
          <CardBody>
            <EmptyState text="No teachers yet" />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {teachers.map((t) => {
              const slip = t.payslips[0];
              const pay = t.teacherPay;
              return (
                <li key={t.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {t.name} {t.status !== "ACTIVE" && <span className="text-xs text-slate-400">(inactive)</span>}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {pay ? `₹ ${money(pay.monthlySalary)} a month${pay.designation ? ` · ${pay.designation}` : ""}` : "Monthly salary not set yet"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {slip ? (
                        <>
                          <Badge color={slip.status === "FINAL" ? "green" : "yellow"}>{slip.status === "FINAL" ? `Paid ₹ ${money(slip.netPay)}` : "Draft"}</Badge>
                          <Link href={`/admin/payroll/${slip.id}`} className="text-sm text-indigo-600 hover:underline">Open slip</Link>
                        </>
                      ) : pay ? (
                        <form action={createPayslip.bind(null, t.id, year, month)}>
                          <Button type="submit" variant="secondary">Create {monthLabel(year, month)} slip</Button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <details className="mt-2" key={`${pay?.monthlySalary}-${pay?.pan}-${pay?.bankAccount}-${pay?.designation}`}>
                    <summary className="text-xs text-indigo-600 hover:underline cursor-pointer list-none">{pay ? "Edit salary and slip details" : "Set monthly salary"}</summary>
                    <form action={setTeacherPay.bind(null, t.id)} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                      <input type="hidden" name="month" value={key} />
                      <Input label="Monthly salary (₹)" name="monthlySalary" type="number" min="0" step="0.01" required defaultValue={pay?.monthlySalary ?? ""} />
                      <Input label="Designation" name="designation" placeholder="e.g. Guitar teacher" defaultValue={pay?.designation ?? ""} />
                      <Input label="PAN" name="pan" placeholder="ABCDE1234F" defaultValue={pay?.pan ?? ""} />
                      <Input
                        label="Bank account number"
                        name="bankAccount"
                        defaultValue={pay?.bankAccount ?? ""}
                        hint={pay?.bankAccount ? `Printed on the slip as ${maskAccount(pay.bankAccount)}` : "Only the last four digits are printed on the slip"}
                      />
                      <Input label="Date of joining" name="joinedOn" type="date" defaultValue={pay?.joinedOn ? format(pay.joinedOn, "yyyy-MM-dd") : ""} />
                      <div className="sm:col-span-2">
                        <Button type="submit" variant="secondary">Save</Button>
                      </div>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
