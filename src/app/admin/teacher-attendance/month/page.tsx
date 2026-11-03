import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import { istToday } from "@/lib/class-changes";
import { dateKey } from "@/lib/reschedule";
import { clockLabel, daysOfMonth, monthBounds, summarise } from "@/lib/teacher-attendance";
import { Card, CardBody, PageHeader, Button, EmptyState } from "@/components/ui";
import { format } from "date-fns";

const shiftMonth = (month: string, by: 1 | -1) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Every teacher's month at a glance: a row per teacher, a column per day.
export default async function TeacherAttendanceMonthPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { today } = istToday();
  const todayKey = dateKey(today);
  const thisMonth = todayKey.slice(0, 7);
  const requested = (await searchParams).month ?? thisMonth;
  const month = monthBounds(requested) && requested <= thisMonth ? requested : thisMonth;
  const bounds = monthBounds(month)!;
  const days = daysOfMonth(month);

  const records = await prisma.teacherAttendance.findMany({
    where: { date: { gte: parseDateOnly(bounds.from), lt: parseDateOnly(bounds.to) } },
    orderBy: { date: "asc" },
  });
  const withRecords = new Set(records.map((r) => r.teacherId));
  // Active teachers, plus anyone since deactivated who has marks this month.
  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER", OR: [{ status: "ACTIVE" }, { id: { in: [...withRecords] } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true },
  });
  const nameOf = new Map(teachers.map((t) => [t.id, t.name]));
  const cell = new Map(records.map((r) => [`${r.teacherId}|${dateKey(r.date)}`, r]));
  const noted = records.filter((r) => r.note);

  return (
    <div>
      <PageHeader
        title="Teacher attendance by month"
        subtitle="P = present, A = absent, a dot means nothing marked. A small mark on a day means there is a note: hover the day for the time and note, or read them in the list below."
      />

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <Link href={`/admin/teacher-attendance/month?month=${shiftMonth(month, -1)}`} className="text-indigo-600 hover:underline">← Previous month</Link>
            <span className="font-medium text-slate-900">{format(parseDateOnly(bounds.from), "MMMM yyyy")}</span>
            {month < thisMonth && <Link href={`/admin/teacher-attendance/month?month=${shiftMonth(month, 1)}`} className="text-indigo-600 hover:underline">Next month →</Link>}
            {month !== thisMonth && <Link href="/admin/teacher-attendance/month" className="text-slate-500 hover:underline">This month</Link>}
          </div>
          <div className="flex items-end gap-3">
            <form method="get" className="flex items-end gap-2">
              <input
                type="month"
                name="month"
                defaultValue={month}
                max={thisMonth}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <Button type="submit" variant="secondary">Show</Button>
            </form>
            <Link href="/admin/teacher-attendance" className="text-sm text-indigo-600 hover:underline py-2">Mark a day →</Link>
          </div>
        </CardBody>
      </Card>

      {teachers.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState text="No teachers" />
          </CardBody>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="sticky left-0 z-10 bg-white text-left font-medium px-4 py-2 min-w-40">Teacher</th>
                    <th className="px-2 py-2 font-medium text-emerald-700">Present</th>
                    <th className="px-2 py-2 font-medium text-red-700">Absent</th>
                    {days.map((d) => {
                      const dt = parseDateOnly(d);
                      return (
                        <th key={d} title={format(dt, "EEEE, d MMM")} className={`px-1 py-2 font-normal min-w-7 ${dt.getDay() === 1 ? "bg-slate-50" : ""}`}>
                          <span className="block">{Number(d.slice(8))}</span>
                          <span className="block text-[10px] text-slate-400">{format(dt, "EEEEE")}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => {
                    const mine = records.filter((r) => r.teacherId === t.id);
                    const totals = summarise(mine);
                    return (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-slate-900 whitespace-nowrap">
                          {t.name}
                          {t.status === "INACTIVE" && <span className="text-xs text-slate-400 font-normal"> (inactive)</span>}
                        </td>
                        <td className="px-2 py-2 text-center text-emerald-700">{totals.present}</td>
                        <td className="px-2 py-2 text-center text-red-700">{totals.absent}</td>
                        {days.map((d) => {
                          const r = cell.get(`${t.id}|${d}`);
                          const monday = parseDateOnly(d).getDay() === 1;
                          if (!r) return <td key={d} className={`px-1 py-2 text-center text-slate-300 ${monday ? "bg-slate-50" : ""}`}>·</td>;
                          const detail = `${format(r.date, "d MMM")}: ${r.status === "PRESENT" ? `present${r.time ? ` at ${clockLabel(r.time)}` : ""}` : "absent"}${r.note ? ` — ${r.note}` : ""}`;
                          return (
                            <td
                              key={d}
                              title={detail}
                              className={`px-1 py-2 text-center text-xs font-semibold ${r.status === "PRESENT" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                            >
                              {r.status === "PRESENT" ? "P" : "A"}
                              {r.note && <sup className="text-[9px]">●</sup>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="px-5 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Notes this month</h2>
            </div>
            {noted.length === 0 ? (
              <CardBody>
                <EmptyState text="No notes this month" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {noted.map((r) => (
                  <li key={r.id} className="px-5 py-3 text-sm">
                    <span className="font-medium text-slate-900">{nameOf.get(r.teacherId) ?? "Teacher"}</span>
                    <span className="text-slate-500"> · {format(r.date, "EEE d MMM")}{r.status === "PRESENT" && r.time ? ` · ${clockLabel(r.time)}` : r.status === "ABSENT" ? " · absent" : ""}</span>
                    <p className="text-slate-600 mt-0.5">{r.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
