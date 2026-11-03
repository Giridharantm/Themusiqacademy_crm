import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import { istToday } from "@/lib/class-changes";
import { addDaysTo, dateKey } from "@/lib/reschedule";
import { dayCodeFromDate, formatTimeLabel } from "@/lib/schedule";
import { istMinutes } from "@/lib/whatsapp-notices";
import { clearTeacherAttendance, markTeacherAttendance } from "@/lib/actions/teacher-attendance-actions";
import { NOTE_MAX_LENGTH, clockLabel, summarise } from "@/lib/teacher-attendance";
import { Card, CardBody, PageHeader, Badge, Button, EmptyState } from "@/components/ui";
import { format } from "date-fns";

const fieldClass = "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

const nowClock = () => {
  const m = istMinutes(new Date());
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export default async function TeacherAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; teacher?: string; saved?: string }>;
}) {
  const sp = await searchParams;
  const { today } = istToday();
  const todayKey = dateKey(today);
  const requested = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayKey;
  const key = requested > todayKey ? todayKey : requested;
  const date = parseDateOnly(key);
  const link = (d: Date) => `/admin/teacher-attendance?date=${dateKey(d)}`;

  const teachers = await prisma.user.findMany({ where: { role: "TEACHER", status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const [records, batches] = await Promise.all([
    prisma.teacherAttendance.findMany({ where: { date }, include: { markedBy: { select: { name: true } } } }),
    prisma.batch.findMany({ where: { dayOfWeek: dayCodeFromDate(date), teacherId: { in: teachers.map((t) => t.id) } }, include: { course: true } }),
  ]);
  const byTeacher = new Map(records.map((r) => [r.teacherId, r]));
  const classesOf = (id: string) => batches.filter((b) => b.teacherId === id).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const totals = summarise(records.filter((r) => teachers.some((t) => t.id === r.teacherId)));

  return (
    <div>
      <PageHeader
        title="Teacher attendance"
        subtitle="Mark whether each teacher came in, the time they arrived, and a note, such as a comp class they are taking. Teachers see their own record under My attendance."
      />

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <Link href={link(addDaysTo(date, -1))} className="text-indigo-600 hover:underline">← Previous day</Link>
            <span className="font-medium text-slate-900">
              {format(date, "EEEE, d MMM yyyy")}
              {key === todayKey ? " (today)" : ""}
            </span>
            {key < todayKey && <Link href={link(addDaysTo(date, 1))} className="text-indigo-600 hover:underline">Next day →</Link>}
            {key !== todayKey && <Link href={link(today)} className="text-slate-500 hover:underline">Today</Link>}
          </div>
          <form method="get" className="flex items-end gap-2">
            <input type="date" name="date" defaultValue={key} max={todayKey} className={fieldClass} />
            <Button type="submit" variant="secondary">Show</Button>
          </form>
        </CardBody>
      </Card>

      {teachers.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState text="No active teachers" />
          </CardBody>
        </Card>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-3">
            <span className="text-emerald-700">{totals.present} present</span> · <span className="text-red-700">{totals.absent} absent</span> · {teachers.length - totals.marked} not marked yet
          </p>
          <Card>
            <ul className="divide-y divide-slate-100">
              {teachers.map((t) => {
                const rec = byTeacher.get(t.id);
                const classes = classesOf(t.id);
                const error = sp.teacher === t.id ? sp.error : undefined;
                return (
                  <li key={t.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{t.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {classes.length === 0 ? "No regular classes this day" : classes.map((b) => `${b.course.name} ${formatTimeLabel(b.startTime)}`).join(" · ")}
                        </p>
                      </div>
                      {rec ? (
                        <div className="text-right">
                          <Badge color={rec.status === "PRESENT" ? "green" : "red"}>
                            {rec.status === "PRESENT" ? `Present${rec.time ? ` · ${clockLabel(rec.time)}` : ""}` : "Absent"}
                          </Badge>
                          <p className="text-xs text-slate-400 mt-1">
                            {sp.saved === t.id ? "Saved · " : ""}marked by {rec.markedBy?.name ?? "unknown"}
                          </p>
                        </div>
                      ) : (
                        <Badge color="slate">Not marked</Badge>
                      )}
                    </div>

                    {/* Keyed on the saved record so the fields show what was just stored. */}
                    <form key={`${t.id}-${rec?.updatedAt.getTime() ?? "none"}`} action={markTeacherAttendance.bind(null, t.id)} className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="date" value={key} />
                      <label className="block">
                        <span className="block text-xs text-slate-500 mb-1">Status</span>
                        <select name="status" defaultValue={rec?.status ?? "PRESENT"} className={fieldClass}>
                          <option value="PRESENT">Present</option>
                          <option value="ABSENT">Absent</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-xs text-slate-500 mb-1">Came in at</span>
                        <input type="time" name="time" defaultValue={rec?.time ?? (key === todayKey ? nowClock() : "")} className={fieldClass} />
                      </label>
                      <label className="block flex-1 min-w-48">
                        <span className="block text-xs text-slate-500 mb-1">Notes</span>
                        <input
                          type="text"
                          name="note"
                          maxLength={NOTE_MAX_LENGTH}
                          defaultValue={rec?.note ?? ""}
                          placeholder="e.g. taking a comp class for Aarav"
                          className={`w-full ${fieldClass}`}
                        />
                      </label>
                      <Button type="submit">{rec ? "Update" : "Save"}</Button>
                    </form>
                    {rec && (
                      <form action={clearTeacherAttendance.bind(null, t.id)} className="mt-2">
                        <input type="hidden" name="date" value={key} />
                        <button type="submit" className="text-xs text-slate-500 hover:text-red-600 hover:underline">Clear this mark</button>
                      </form>
                    )}
                    {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
