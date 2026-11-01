import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { bookClassChange, cancelClassChange } from "@/lib/actions/class-change-actions";
import { slotOptionsFor, istToday } from "@/lib/class-changes";
import { parseDateOnly } from "@/lib/attendance";
import { COMP_WORKING_DAYS, addDaysTo, dateKey } from "@/lib/reschedule";
import { DAY_LABELS, dayCodeFromDate, formatTimeLabel } from "@/lib/schedule";
import { normalizeSearchQuery, phoneSearchDigits } from "@/lib/search";
import { Card, CardBody, CardHeader, PageHeader, Input, Button, Badge, EmptyState } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { format } from "date-fns";

const dayLabel = (d: Date) => format(d, "EEE d MMM");

// The next date on or after `from` that falls on the given weekday code.
function nextOn(dayOfWeek: string, from: Date) {
  let d = new Date(from);
  for (let i = 0; i < 7 && dayCodeFromDate(d) !== dayOfWeek; i++) d = addDaysTo(d, 1);
  return d;
}

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ on?: string; q?: string; studentId?: string; batchId?: string; date?: string; error?: string; saved?: string; messaged?: string }>;
}) {
  const sp = await searchParams;
  const { today } = istToday();
  const on = sp.on ? parseDateOnly(sp.on) : today;
  const q = normalizeSearchQuery(sp.q);
  const phoneDigits = q ? phoneSearchDigits(q) : undefined;

  const changes = await prisma.classChange.findMany({
    where: { status: "BOOKED", OR: [{ fromDate: on }, { toDate: on }] },
    include: { student: true, course: true, fromBatch: true, toBatch: true },
    orderBy: { createdAt: "asc" },
  });

  const matches = q
    ? await prisma.student.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
            { studentCode: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { name: "asc" },
        take: 8,
      })
    : [];

  const student = sp.studentId
    ? await prisma.student.findUnique({
        where: { id: sp.studentId },
        include: { enrollments: { where: { status: "ACTIVE" }, include: { batch: { include: { course: true } } } } },
      })
    : null;
  const classes = (student?.enrollments ?? []).map((e) => e.batch).sort((a, b) => a.course.name.localeCompare(b.course.name) || a.startTime.localeCompare(b.startTime));
  const fromBatch = classes.find((b) => b.id === sp.batchId);
  const fromDate = fromBatch ? (sp.date ? parseDateOnly(sp.date) : nextOn(fromBatch.dayOfWeek, today)) : null;
  const options = student && fromBatch && fromDate ? await slotOptionsFor(student.id, fromBatch.id, fromDate) : null;
  const slotBatches = options && options.length > 0 ? await prisma.batch.findMany({ where: { id: { in: options.map((o) => o.batchId) } }, include: { teacher: true } }) : [];

  return (
    <div>
      <PageHeader
        title="Class changes"
        subtitle={`A missed class can be made up the same day or within ${COMP_WORKING_DAYS} working days. Drums, Keyboard and Guitar may move to another day; the other instruments only to another time on the same day.`}
      />

      {sp.saved && (
        <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          {sp.messaged ? "Saved, and the family has been messaged on WhatsApp." : "Saved. Let the family know it is confirmed."}
        </p>
      )}
      {sp.error && <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{sp.error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title={`Changes on ${dayLabel(on)}`}
              action={
                <form method="get" className="flex items-center gap-2">
                  <input type="date" name="on" defaultValue={dateKey(on)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
                  <Button type="submit" variant="secondary">Show</Button>
                </form>
              }
            />
            {changes.length === 0 ? (
              <CardBody>
                <EmptyState text="No changes booked for this day" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {changes.map((c) => {
                  const awayToday = dateKey(c.fromDate) === dateKey(on);
                  return (
                    <li key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {c.student.name} <span className="text-slate-400 font-normal">· {c.course.name}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {awayToday
                            ? c.toBatch && c.toDate
                              ? `Not at ${formatTimeLabel(c.fromBatch.startTime)} — moved to ${dayLabel(c.toDate)} ${formatTimeLabel(c.toBatch.startTime)}`
                              : `Not coming to the ${formatTimeLabel(c.fromBatch.startTime)} class`
                            : `Make-up for ${dayLabel(c.fromDate)} ${formatTimeLabel(c.fromBatch.startTime)} — comes at ${formatTimeLabel(c.toBatch!.startTime)}`}
                          {c.note ? ` · ${c.note}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge color={awayToday ? "yellow" : "blue"}>{awayToday ? (c.kind === "MOVE" ? "Moved away" : "Not coming") : "Make-up"}</Badge>
                        <form action={cancelClassChange.bind(null, c.id, dateKey(on))}>
                          <Button type="submit" variant="ghost">Cancel</Button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Book a change" subtitle="Skip a class or make it up in another slot" />
          <CardBody className="space-y-4">
            {!student && (
              <>
                <SearchBox placeholder="Student name, code or phone" defaultValue={q} />
                {q && matches.length === 0 && <p className="text-sm text-slate-400">No active student found</p>}
                <ul className="divide-y divide-slate-100">
                  {matches.map((s) => (
                    <li key={s.id}>
                      <Link href={`/admin/changes?studentId=${s.id}`} className="flex items-center justify-between py-2 text-sm text-slate-900 hover:text-indigo-600">
                        <span>{s.name}</span>
                        <span className="text-xs text-slate-400">{s.studentCode}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {student && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900">{student.name}</p>
                  <Link href="/admin/changes" className="text-xs text-indigo-600 hover:underline">Change student</Link>
                </div>

                {classes.length === 0 ? (
                  <p className="text-sm text-slate-400">No active classes</p>
                ) : (
                  <form method="get" className="space-y-3">
                    <input type="hidden" name="studentId" value={student.id} />
                    <label className="block">
                      <span className="block text-sm font-medium text-ink mb-1">Class being missed</span>
                      <select name="batchId" defaultValue={fromBatch?.id ?? ""} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                        <option value="" disabled>Choose a class</option>
                        {classes.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.course.name} · {DAY_LABELS[b.dayOfWeek]} · {formatTimeLabel(b.startTime)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input label="Date of that class" name="date" type="date" defaultValue={fromDate ? dateKey(fromDate) : ""} hint="Defaults to the next one; pick an earlier date for a class already missed" />
                    <Button type="submit" variant="secondary" className="w-full">Show available slots</Button>
                  </form>
                )}

                {fromBatch && fromDate && options === null && <p className="text-sm text-red-600">That date isn&apos;t a {DAY_LABELS[fromBatch.dayOfWeek]}, so it isn&apos;t one of this student&apos;s classes.</p>}

                {fromBatch && fromDate && options && (
                  <form action={bookClassChange.bind(null, student.id, fromBatch.id, dateKey(fromDate))} className="space-y-3 border-t border-slate-100 pt-4">
                    <p className="text-sm text-slate-600">
                      Missing {fromBatch.course.name} on <span className="font-medium">{dayLabel(fromDate)}, {formatTimeLabel(fromBatch.startTime)}</span>
                    </p>
                    {options.length === 0 && (
                      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        No free slot in the allowed days. Ask the family to call the academy.
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {options.map((o) => {
                        const b = slotBatches.find((x) => x.id === o.batchId);
                        return (
                          <li key={`${o.batchId}|${o.dateKey}`}>
                            <label className="flex items-center gap-2 text-sm rounded-md border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                              <input type="radio" name="toSlot" value={`${o.batchId}|${o.dateKey}`} required />
                              <span className="flex-1">
                                {dayLabel(o.date)} · {formatTimeLabel(o.startTime)}
                                {b?.teacher ? <span className="text-slate-400"> · {b.teacher.name}</span> : null}
                              </span>
                              <span className="text-xs text-slate-400">{o.seatsLeft === null ? "" : `${o.seatsLeft} seat${o.seatsLeft === 1 ? "" : "s"} left`}</span>
                            </label>
                          </li>
                        );
                      })}
                      <li>
                        <label className="flex items-center gap-2 text-sm rounded-md border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                          <input type="radio" name="toSlot" value="" required={options.length === 0} defaultChecked={options.length === 0} />
                          <span>Not coming, no new slot yet</span>
                        </label>
                      </li>
                    </ul>
                    <Input label="Note (optional)" name="note" placeholder="e.g. Out of town" />
                    {options.length > 0 && (
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input type="checkbox" name="notify" defaultChecked className="mt-0.5" />
                        <span>Message the family on WhatsApp about the new slot <span className="text-slate-400">(if they have agreed to WhatsApp)</span></span>
                      </label>
                    )}
                    <Button type="submit" className="w-full">Book</Button>
                  </form>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
