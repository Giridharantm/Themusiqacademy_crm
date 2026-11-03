import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { parseDateOnly } from "@/lib/attendance";
import { istToday } from "@/lib/class-changes";
import { dateKey } from "@/lib/reschedule";
import { TEACHER_ATTENDANCE_LABELS, clockLabel, monthBounds, summarise } from "@/lib/teacher-attendance";
import { Card, CardBody, PageHeader, Badge, Button, EmptyState } from "@/components/ui";
import { format } from "date-fns";

// A teacher's own attendance as the front desk marked it: only theirs, one month at a time.
export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireRole("TEACHER");
  const { today } = istToday();
  const thisMonth = dateKey(today).slice(0, 7);
  const requested = (await searchParams).month ?? thisMonth;
  const month = monthBounds(requested) && requested <= thisMonth ? requested : thisMonth;
  const bounds = monthBounds(month)!;

  const records = await prisma.teacherAttendance.findMany({
    where: { teacherId: user.id, date: { gte: parseDateOnly(bounds.from), lt: parseDateOnly(bounds.to) } },
    orderBy: { date: "desc" },
  });
  const totals = summarise(records);

  return (
    <div>
      <PageHeader title="My attendance" subtitle="The days the front desk has marked you present or absent, with the time you came in and any notes." />

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-end justify-between gap-4">
          <form method="get" className="flex items-end gap-2">
            <input
              type="month"
              name="month"
              defaultValue={month}
              max={thisMonth}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <Button type="submit" variant="secondary">Show</Button>
            {month !== thisMonth && <Link href="/teacher/my-attendance" className="text-sm text-slate-500 hover:underline py-2">This month</Link>}
          </form>
          <p className="text-sm text-slate-500">
            {format(parseDateOnly(bounds.from), "MMMM yyyy")}: <span className="text-emerald-700">{totals.present} present</span> · <span className="text-red-700">{totals.absent} absent</span>
          </p>
        </CardBody>
      </Card>

      <Card>
        {records.length === 0 ? (
          <CardBody>
            <EmptyState text="Nothing marked for this month yet" />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {records.map((r) => (
              <li key={r.id} className="px-5 py-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{format(r.date, "EEEE, d MMM")}</p>
                  {r.note && <p className="text-xs text-slate-500 mt-0.5">{r.note}</p>}
                </div>
                <Badge color={r.status === "PRESENT" ? "green" : "red"}>
                  {TEACHER_ATTENDANCE_LABELS[r.status]}
                  {r.status === "PRESENT" && r.time ? ` · ${clockLabel(r.time)}` : ""}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
