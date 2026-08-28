import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, PageHeader, StatCard, EmptyState, Badge } from "@/components/ui";
import { format } from "date-fns";

export default async function AdminDashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayCode = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getDay()];

  const [leadCounts, activeStudents, renewalsThisMonth, upcomingFollowUps, todaysBatches, invoices] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], _count: true }),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "ACTIVE", endDate: { gte: monthStart, lt: monthEnd } } }),
    prisma.followUp.findMany({
      where: { done: false, followUpDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      include: { lead: true },
      orderBy: { followUpDate: "asc" },
      take: 5,
    }),
    prisma.batch.findMany({ where: { dayOfWeek: todayCode }, include: { course: true, teacher: true } }),
    prisma.invoice.findMany({ where: { status: { not: "CANCELLED" } }, include: { payments: true } }),
  ]);

  const leadCountByStatus = Object.fromEntries(leadCounts.map((l) => [l.status, l._count]));
  const totalOpenLeads = leadCounts
    .filter((l) => l.status !== "CONVERTED" && l.status !== "LOST")
    .reduce((sum, l) => sum + l._count, 0);
  const leadsHint = `New ${leadCountByStatus.NEW ?? 0} · Contacted ${leadCountByStatus.CONTACTED ?? 0} · Trial ${leadCountByStatus.TRIAL_SCHEDULED ?? 0}`;

  const revenueThisMonth = invoices
    .flatMap((i) => i.payments)
    .filter((p) => p.paidDate >= monthStart && p.paidDate < monthEnd)
    .reduce((sum, p) => sum + p.amount, 0);
  const outstandingDues = invoices
    .filter((i) => i.status === "PENDING" || i.status === "PARTIAL" || i.status === "OVERDUE")
    .reduce((sum, i) => sum + (i.total - i.payments.reduce((s, p) => s + p.amount, 0)), 0);

  const courseIdsToday = Array.from(new Set(todaysBatches.map((b) => b.courseId)));
  const [todaysEnrollments, todaysAttendance] = await Promise.all([
    prisma.enrollment.findMany({
      where: { status: "ACTIVE", batch: { dayOfWeek: todayCode, courseId: { in: courseIdsToday } } },
      select: { studentId: true, batch: { select: { courseId: true } } },
    }),
    prisma.attendance.findMany({
      where: { date: todayDateOnly, courseId: { in: courseIdsToday } },
      select: { studentId: true, courseId: true },
    }),
  ]);

  // Grouped by instrument, not by individual batch — marking attendance is
  // an instrument+day action now, not per time-slot, so that's the unit an
  // admin actually cares about here ("has Guitar been marked today", not
  // "has the 5pm Guitar slot been marked").
  const classesToday = courseIdsToday
    .map((courseId) => {
      const courseBatches = todaysBatches.filter((b) => b.courseId === courseId);
      const teachers = Array.from(new Set(courseBatches.map((b) => b.teacher?.name ?? "Unassigned")));
      const rosterSize = new Set(
        todaysEnrollments.filter((e) => e.batch.courseId === courseId).map((e) => e.studentId)
      ).size;
      const markedCount = new Set(
        todaysAttendance.filter((a) => a.courseId === courseId).map((a) => a.studentId)
      ).size;
      return {
        courseId,
        courseName: courseBatches[0].course.name,
        teachers,
        batchCount: courseBatches.length,
        rosterSize,
        markedCount,
      };
    })
    .sort((a, b) => a.courseName.localeCompare(b.courseName));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of leads, students and billing" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Open leads" value={totalOpenLeads} hint={leadsHint} href="/admin/leads?status=open" />
        <StatCard label="Active students" value={activeStudents} href="/admin/students?status=ACTIVE" />
        <StatCard label="Renewals this month" value={renewalsThisMonth} hint="Subscriptions expiring this month" href="/admin/students?renewal=this-month" />
        <StatCard label="Classes today" value={todaysBatches.length} href={`/admin/batches?day=${todayCode}`} />
        <StatCard label="Revenue this month" value={`Rs. ${revenueThisMonth.toLocaleString("en-IN")}`} hint="Payments collected this month" href="/admin/billing" />
        <StatCard label="Outstanding dues" value={`Rs. ${outstandingDues.toLocaleString("en-IN")}`} hint="Pending, partial & overdue invoices" href="/admin/billing" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Upcoming follow-ups" action={<Link href="/admin/leads" className="text-sm text-indigo-600 hover:underline">View all leads</Link>} />
          <CardBody>
            {upcomingFollowUps.length === 0 ? (
              <EmptyState text="No upcoming follow-ups" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingFollowUps.map((f) => (
                  <li key={f.id} className="py-3 flex items-center justify-between">
                    <div>
                      <Link href={`/admin/leads/${f.leadId}`} className="text-sm font-medium text-slate-900 hover:text-indigo-600">
                        {f.lead.name}
                      </Link>
                      <p className="text-xs text-slate-500">{f.note}</p>
                    </div>
                    <span className="text-xs text-slate-400">{format(f.followUpDate, "d MMM")}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Classes today" subtitle={format(now, "EEEE, d MMM yyyy")} action={<Link href="/admin/batches" className="text-sm text-indigo-600 hover:underline">View all batches</Link>} />
          {classesToday.length === 0 ? (
            <CardBody>
              <EmptyState text="No classes scheduled today" />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {classesToday.map((c) => {
                const markedStatus =
                  c.markedCount === 0 ? { label: "Not marked yet", color: "red" } :
                  c.rosterSize > 0 && c.markedCount >= c.rosterSize ? { label: "Marked", color: "green" } :
                  { label: `${c.markedCount} of ${c.rosterSize} marked`, color: "yellow" };
                return (
                  <li key={c.courseId} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{c.courseName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {c.teachers.join(", ")} · {c.batchCount} batch{c.batchCount !== 1 ? "es" : ""} · {c.rosterSize} student{c.rosterSize !== 1 ? "s" : ""} scheduled
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge color={markedStatus.color}>{markedStatus.label}</Badge>
                      <Link
                        href={`/admin/attendance?courseId=${c.courseId}&date=${format(now, "yyyy-MM-dd")}`}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        Mark
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
