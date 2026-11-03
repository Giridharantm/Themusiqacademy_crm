import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import { istToday } from "@/lib/class-changes";
import { buildDaySchedule } from "@/lib/day-schedule";
import { addDaysTo, dateKey } from "@/lib/reschedule";
import { OPERATING_DAYS, dayCodeFromDate, formatTimeLabel } from "@/lib/schedule";
import { Card, CardBody, CardHeader, PageHeader, Badge, Button, EmptyState } from "@/components/ui";
import { format } from "date-fns";

const dayLabel = (d: Date) => format(d, "EEEE, d MMM");

// The next / previous class day (Monday is the holiday).
function stepDay(from: Date, by: 1 | -1) {
  let d = addDaysTo(from, by);
  while (!OPERATING_DAYS.includes(dayCodeFromDate(d))) d = addDaysTo(d, by);
  return d;
}

export default async function DaySchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; courseId?: string; empty?: string }> }) {
  const sp = await searchParams;
  const { today } = istToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? parseDateOnly(sp.date!) : today;
  const key = dateKey(date);
  const isClassDay = OPERATING_DAYS.includes(dayCodeFromDate(date));
  const link = (d: Date) => ({ pathname: "/admin/schedule", query: { date: dateKey(d), ...(sp.courseId ? { courseId: sp.courseId } : {}), ...(sp.empty ? { empty: "1" } : {}) } });

  const courses = await prisma.course.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const batches = isClassDay
    ? await prisma.batch.findMany({
        where: { dayOfWeek: dayCodeFromDate(date), ...(sp.courseId ? { courseId: sp.courseId } : {}) },
        include: { course: true, teacher: true },
      })
    : [];
  const batchIds = batches.map((b) => b.id);

  const [enrollments, changes, attendance, confirmations] = await Promise.all([
    prisma.enrollment.findMany({ where: { status: "ACTIVE", student: { status: "ACTIVE" }, batchId: { in: batchIds } }, include: { student: true } }),
    prisma.classChange.findMany({
      where: { status: "BOOKED", student: { status: "ACTIVE" }, OR: [{ fromBatchId: { in: batchIds }, fromDate: date }, { toBatchId: { in: batchIds }, toDate: date }] },
      include: { student: true, toBatch: true },
    }),
    prisma.attendance.findMany({ where: { date, status: "PRESENT", courseId: { in: batches.map((b) => b.courseId) } }, select: { studentId: true, courseId: true } }),
    prisma.classConfirmation.findMany({ where: { date, kind: "REGULAR", batchId: { in: batchIds } }, select: { studentId: true, batchId: true, answer: true } }),
  ]);

  const slots = buildDaySchedule({
    dateKey: key,
    batches: batches.map((b) => ({
      id: b.id,
      courseId: b.courseId,
      courseName: b.course.name,
      startTime: b.startTime,
      endTime: b.endTime,
      teacherName: b.teacher?.name ?? null,
      maxStudents: b.maxStudents,
      courseMaxStudents: b.course.maxStudents,
    })),
    enrollments: enrollments.map((e) => ({ batchId: e.batchId, studentId: e.studentId, studentName: e.student.name })),
    changes: changes.map((c) => ({
      studentId: c.studentId,
      studentName: c.student.name,
      fromBatchId: c.fromBatchId,
      fromDateKey: dateKey(c.fromDate),
      toBatchId: c.toBatchId,
      toDateKey: c.toDate ? dateKey(c.toDate) : null,
      toLabel: c.toBatch && c.toDate ? `${format(c.toDate, "EEE d MMM")} ${formatTimeLabel(c.toBatch.startTime)}` : null,
    })),
    presentKeys: new Set(attendance.map((a) => `${a.studentId}|${a.courseId}`)),
    answers: new Map(confirmations.map((c) => [`${c.studentId}|${c.batchId}`, c.answer])),
  });

  const shown = slots.filter((s) => sp.empty || s.students.length > 0 || s.away.length > 0);
  const byTime = shown.reduce<Map<string, typeof shown>>((m, s) => m.set(s.batch.startTime, [...(m.get(s.batch.startTime) ?? []), s]), new Map());
  const total = shown.reduce((n, s) => n + s.students.length, 0);
  const regular = shown.flatMap((s) => s.students).filter((st) => !st.makeUp);
  const confirmed = regular.filter((st) => st.reply === "YES").length;
  const saidNo = regular.filter((st) => st.reply === "NO").length;
  // Reminders go out on the day itself, so only then is "no reply" meaningful.
  const reminded = key <= dateKey(today);

  return (
    <div>
      <PageHeader
        title="Day schedule"
        subtitle="Who is actually coming to each slot on a day: the permanent batch roster, less anyone skipping or moved away, plus make-up students. The permanent batches stay under Batches."
      />

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <Link href={link(stepDay(date, -1))} className="text-indigo-600 hover:underline">← Previous day</Link>
            <span className="font-medium text-slate-900">
              {dayLabel(date)}
              {key === dateKey(today) ? " (today)" : ""}
            </span>
            <Link href={link(stepDay(date, 1))} className="text-indigo-600 hover:underline">Next day →</Link>
            {key !== dateKey(today) && <Link href={link(today)} className="text-slate-500 hover:underline">Today</Link>}
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="date" name="date" defaultValue={key} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <select name="courseId" defaultValue={sp.courseId ?? ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">All instruments</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" name="empty" value="1" defaultChecked={!!sp.empty} /> Show empty slots
            </label>
            <Button type="submit" variant="secondary">Show</Button>
          </form>
        </CardBody>
      </Card>

      {!isClassDay ? (
        <Card>
          <CardBody>
            <EmptyState text="No classes — Monday is a holiday" />
          </CardBody>
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState text="No students in any slot on this day" />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-slate-500">
            {total} student{total === 1 ? "" : "s"} expected across {shown.length} slot{shown.length === 1 ? "" : "s"}
            {(confirmed > 0 || saidNo > 0 || reminded) && (
              <>
                {" "}
                · <span className="text-emerald-700">{confirmed} confirmed</span> · <span className="text-red-700">{saidNo} said no</span>
                {reminded ? ` · ${regular.length - confirmed - saidNo} no reply yet` : ""}
              </>
            )}
          </p>
          {Array.from(byTime.entries()).map(([time, group]) => (
            <Card key={time}>
              <CardHeader title={formatTimeLabel(time)} />
              <ul className="divide-y divide-slate-100">
                {group.map((s) => {
                  const over = s.limit !== null && s.taken > s.limit;
                  const full = s.limit !== null && s.taken === s.limit;
                  return (
                    <li key={s.batch.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">
                          {s.batch.courseName}
                          <span className="text-slate-400 font-normal"> · {s.batch.teacherName ?? "Unassigned"}</span>
                        </p>
                        <Badge color={over ? "red" : full ? "yellow" : "slate"}>
                          {s.limit === null ? `${s.taken} student${s.taken === 1 ? "" : "s"}` : `${s.taken}/${s.limit}${over ? " over" : full ? " full" : ""}`}
                        </Badge>
                      </div>
                      {s.students.length === 0 ? (
                        <p className="text-xs text-slate-400 mt-1">Nobody expected</p>
                      ) : (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {s.students.map((st) => (
                            <li key={st.id} className={`text-xs rounded-full border px-2.5 py-1 ${st.makeUp ? "bg-amber-50 border-amber-200 text-amber-800" : st.reply === "YES" ? "bg-emerald-50 border-emerald-300 text-emerald-800" : st.reply === "NO" ? "bg-red-50 border-red-300 text-red-800" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
                              <Link href={`/admin/students/${st.id}`} className="hover:underline">{st.name}</Link>
                              {st.makeUp ? " · make-up" : ""}
                              {st.reply === "YES" && " · confirmed"}
                              {st.reply === "NO" && " · said no"}
                              {st.present ? " ✓" : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                      {s.away.length > 0 && (
                        <p className="text-xs text-slate-500 mt-1.5">
                          Not coming: {s.away.map((a) => `${a.name} (${a.detail})`).join(", ")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
          <p className="text-xs text-slate-400">✓ = marked present. Amber = here for a make-up class. Green = confirmed on the WhatsApp reminder, red = said they can&apos;t come, grey = no reply yet.</p>
        </div>
      )}
    </div>
  );
}
