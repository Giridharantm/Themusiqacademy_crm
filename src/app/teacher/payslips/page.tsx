import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { monthLabel } from "@/lib/expenses";
import { money } from "@/lib/invoice";
import { Card, CardBody, PageHeader, EmptyState } from "@/components/ui";

// A teacher's own payslips: only slips the admin has finalised, and only theirs.
export default async function TeacherPayslipsPage() {
  const user = await requireRole("TEACHER");
  const slips = await prisma.payslip.findMany({
    where: { teacherId: user.id, status: "FINAL" },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  return (
    <div>
      <PageHeader title="Payslips" subtitle="Your monthly salary slips. Open one to download or print it." />
      <Card>
        {slips.length === 0 ? (
          <CardBody>
            <EmptyState text="No payslips yet. They appear here once your salary for the month has been paid." />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {slips.map((s) => (
              <li key={s.id} className="px-5 py-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{monthLabel(s.year, s.month)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Net pay ₹ {money(s.netPay)}</p>
                </div>
                <Link href={`/teacher/payslips/${s.id}`} className="text-sm text-indigo-600 hover:underline">
                  Open / download
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
