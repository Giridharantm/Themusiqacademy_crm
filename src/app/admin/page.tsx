import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, PageHeader, StatCard, EmptyState, Badge, Button } from "@/components/ui";
import { markStudentFollowUpDone } from "@/lib/actions/student-actions";
import { subscriptionTotals, countUsedClasses, attendanceForSubscription } from "@/lib/subscription";
import { format } from "date-fns";

// Below this many classes remaining, a subscription counts toward the
// dashboard's "Renewals due soon" stat — independent of its expiry date, so
// a student who's burning through classes fast still surfaces even with
// weeks left on the calendar. Distinct from the per-subscription "Renew
// soon" badge (remaining <= 2) used elsewhere.
const LOW_CLASSES_THRESHOLD = 6;

// No PRESENT attendance in this many days (for a student with an active
// subscription that still has classes left) counts as "irregular" — they're
// paying for classes they aren't using.
const IRREGULAR_DAYS = 20;

export default async function AdminDashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayCode = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getDay()];

  const [leadCounts, activeStudents, activeSubscriptions, upcomingFollowUps, studentCallbacksDue, todaysBatches, invoices] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], _count: true }),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.findMany({
      where: { status: "ACTIVE" },
      include: { bonusGrants: true, course: true, student: { include: { attendance: true } } },
    }),
    prisma.followUp.findMany({
      where: { done: false, followUpDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      include: { lead: true },
      orderBy: { followUpDate: "asc" },
      take: 5,
    }),
    // No lower bound on the date: an overdue callback (missed while it was
    // "upcoming") is the most urgent thing to surface here, not something
    // that should quietly fall off the list once its date has passed.
    prisma.studentFollowUp.findMany({
      where: { done: false },
      include: { student: true },
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
  const trialCount = (leadCountByStatus.TRIAL_SCHEDULED ?? 0) + (leadCountByStatus.TRIAL_COMPLETED ?? 0);
  const leadsHint = `New ${leadCountByStatus.NEW ?? 0} · Contacted ${leadCountByStatus.CONTACTED ?? 0} · Trial ${trialCount}`;

  const irregularSince = new Date(todayDateOnly);
  irregularSince.setDate(irregularSince.getDate() - IRREGULAR_DAYS);

  // Resolve each active subscription's live remaining-classes and last
  // PRESENT date once, so the "due soon" stat and the two watch-list
  // sections below all agree with each other and with the rest of the app.
  const subscriptionStats = activeSubscriptions.map((sub) => {
    const courseAttendance = sub.student.attendance.filter((a) => a.courseId === sub.courseId);
    const used = countUsedClasses(attendanceForSubscription(sub.startDate, courseAttendance));
    const remaining = subscriptionTotals(sub, used).remaining;
    const lastPresent = courseAttendance
      .filter((a) => a.status === "PRESENT")
      .reduce((latest: Date | null, a) => (!latest || a.date > latest ? a.date : latest), null);
    return { sub, remaining, lastPresent };
  });

  const renewalsDueSoon = subscriptionStats.filter((s) => s.remaining < LOW_CLASSES_THRESHOLD).length;

  const expiringThisMonth = subscriptionStats
    .filter((s) => s.sub.endDate && s.sub.endDate >= monthStart && s.sub.endDate < monthEnd)
    .sort((a, b) => a.sub.endDate!.getTime() - b.sub.endDate!.getTime());

  // A subscription that started too recently to have had a fair chance to
  // rack up 20 quiet days yet doesn't count — otherwise every brand-new
  // enrollment would show up as "irregular" on day one.
  const irregularStudents = subscriptionStats
    .filter((s) => s.remaining > 0 && s.sub.startDate < irregularSince)
    .filter((s) => !s.lastPresent || s.lastPresent < irregularSince)
    .sort((a, b) => (a.lastPresent?.getTime() ?? 0) - (b.lastPresent?.getTime() ?? 0));

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
      where: { status: "ACTIVE", student: { status: "ACTIVE" }, batch: { dayOfWeek: todayCode, courseId: { in: courseIdsToday } } },
      select: { studentId: true, batch: { select: { courseId: true } } },
    }),
    prisma.attendance.findMany({
      where: { date: todayDateOnly, courseId: { in: courseIdsToday }, student: { status: "ACTIVE" } },
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
        <StatCard label="Renewals due soon" value={renewalsDueSoon} hint={`Fewer than ${LOW_CLASSES_THRESHOLD} classes remaining`} href="/admin/students?renewal=under6" />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader title="Student callbacks due" subtitle="Students to call back about renewing, not currently on a subscription follow-up" />
          <CardBody>
            {studentCallbacksDue.length === 0 ? (
              <EmptyState text="No callbacks due" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {studentCallbacksDue.map((f) => {
                  const overdue = f.followUpDate < todayDateOnly;
                  return (
                    <li key={f.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/admin/students/${f.studentId}`} className="text-sm font-medium text-slate-900 hover:text-indigo-600">
                          {f.student.name}
                        </Link>
                        <p className="text-xs text-slate-500">{f.note}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs ${overdue ? "text-red-600" : "text-slate-400"}`}>
                          {format(f.followUpDate, "d MMM")}{overdue ? " · overdue" : ""}
                        </span>
                        <form action={markStudentFollowUpDone.bind(null, f.id, f.studentId)}>
                          <Button type="submit" variant="ghost">Done</Button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Expiry & attendance watch" subtitle="Who to check in on this month" />
          <CardBody className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Expiring this month ({expiringThisMonth.length})
              </p>
              {expiringThisMonth.length === 0 ? (
                <EmptyState text="No subscriptions expiring this month" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {expiringThisMonth.slice(0, 6).map(({ sub }) => (
                    <li key={sub.id} className="py-2 flex items-center justify-between gap-3">
                      <Link href={`/admin/students/${sub.studentId}`} className="text-sm font-medium text-slate-900 hover:text-indigo-600 min-w-0 truncate">
                        {sub.student.name} <span className="text-xs font-normal text-slate-400">· {sub.course.name}</span>
                      </Link>
                      <span className="text-xs text-slate-400 shrink-0">{format(sub.endDate!, "d MMM")}</span>
                    </li>
                  ))}
                  {expiringThisMonth.length > 6 && (
                    <li className="pt-2 text-xs text-slate-400">+{expiringThisMonth.length - 6} more</li>
                  )}
                </ul>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Irregular attendance ({irregularStudents.length})
              </p>
              {irregularStudents.length === 0 ? (
                <EmptyState text="No irregular students right now" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {irregularStudents.slice(0, 6).map(({ sub, lastPresent }) => (
                    <li key={sub.id} className="py-2 flex items-center justify-between gap-3">
                      <Link href={`/admin/students/${sub.studentId}`} className="text-sm font-medium text-slate-900 hover:text-indigo-600 min-w-0 truncate">
                        {sub.student.name} <span className="text-xs font-normal text-slate-400">· {sub.course.name}</span>
                      </Link>
                      <span className="text-xs text-red-600 shrink-0">
                        {lastPresent ? `Last seen ${format(lastPresent, "d MMM")}` : "Never attended"}
                      </span>
                    </li>
                  ))}
                  {irregularStudents.length > 6 && (
                    <li className="pt-2 text-xs text-slate-400">+{irregularStudents.length - 6} more</li>
                  )}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
