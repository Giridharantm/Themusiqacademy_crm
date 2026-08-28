import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createBatch, updateBatch, deleteBatch } from "@/lib/actions/batch-actions";
import { Card, CardBody, CardHeader, PageHeader, Input, Select, Button, EmptyState, Badge } from "@/components/ui";
import { BatchScheduleFields } from "@/components/batch-schedule-fields";
import { BatchFilterFields } from "@/components/batch-filter-fields";
import { DAY_LABELS, OPERATING_DAYS, formatTimeLabel, sortBatches } from "@/lib/schedule";

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; day?: string; time?: string }>;
}) {
  const { courseId: filterCourseId, day: filterDay, time: filterTime } = await searchParams;

  const [allBatchesRaw, courses, teachers] = await Promise.all([
    prisma.batch.findMany({
      include: { course: true, teacher: true, _count: { select: { enrollments: true } } },
    }),
    prisma.course.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "TEACHER", status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);

  const allBatches = sortBatches(allBatchesRaw);

  const courseOptions = Array.from(new Map(allBatches.map((b) => [b.courseId, b.course.name])).entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));
  const dayOptions = OPERATING_DAYS.filter((d) => allBatches.some((b) => b.dayOfWeek === d)).map((d) => ({
    value: d,
    label: DAY_LABELS[d],
  }));
  const timeOptions = Array.from(new Set(allBatches.map((b) => b.startTime)))
    .sort()
    .map((t) => ({ value: t, label: formatTimeLabel(t) }));

  const batches = allBatches.filter(
    (b) =>
      (!filterCourseId || b.courseId === filterCourseId) &&
      (!filterDay || b.dayOfWeek === filterDay) &&
      (!filterTime || b.startTime === filterTime)
  );

  return (
    <div>
      <PageHeader
        title="Batches"
        subtitle="One instrument + one day + one time slot per batch. Mon: holiday · Tue-Fri: 3pm-9pm · Sat: 2pm-8pm · Sun: 11am-5pm (1hr batches)"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title={`${batches.length} batch${batches.length !== 1 ? "es" : ""}`}
              action={
                <form method="get" className="w-full">
                  <BatchFilterFields
                    courseOptions={courseOptions}
                    dayOptions={dayOptions}
                    timeOptions={timeOptions}
                    selectedCourseId={filterCourseId}
                    selectedDay={filterDay}
                    selectedTime={filterTime}
                  />
                </form>
              }
            />
            {batches.length === 0 ? (
              <CardBody>
                <EmptyState text={allBatches.length === 0 ? "No batches created yet" : "No batches match these filters"} />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {batches.map((b) => (
                  <li key={b.id} className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <Link href={`/admin/batches/${b.id}`} className="flex-1">
                        <p className="text-sm font-medium text-slate-900 hover:text-indigo-600">
                          {b.course.name} &middot; {DAY_LABELS[b.dayOfWeek]} &middot; {formatTimeLabel(b.startTime)} - {formatTimeLabel(b.endTime)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {b.teacher?.name ?? "Unassigned"} · {b.room ?? "No room set"}
                        </p>
                      </Link>
                      <div className="flex items-center gap-2">
                        <Badge>{b._count.enrollments} student{b._count.enrollments !== 1 ? "s" : ""}</Badge>
                        <form action={deleteBatch.bind(null, b.id)}>
                          <Button type="submit" variant="ghost">Delete</Button>
                        </form>
                      </div>
                    </div>
                    <details className="mt-1.5" key={`${b.dayOfWeek}-${b.startTime}-${b.teacherId}-${b.room}`}>
                      <summary className="text-xs text-indigo-600 hover:underline cursor-pointer list-none">Edit</summary>
                      <form action={updateBatch.bind(null, b.id)} className="mt-2 space-y-3 max-w-sm">
                        <Select label="Teacher" name="teacherId" defaultValue={b.teacherId ?? ""}>
                          <option value="">Unassigned</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </Select>
                        <BatchScheduleFields defaultDay={b.dayOfWeek} defaultTimeSlot={`${b.startTime}|${b.endTime}`} />
                        <Input label="Room" name="room" placeholder="e.g. Room 1" defaultValue={b.room ?? ""} />
                        <Button type="submit" variant="secondary" className="w-full">Save changes</Button>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="New batch" />
          <CardBody>
            <form action={createBatch} className="space-y-3">
              <Select label="Instrument" name="courseId" required defaultValue="">
                <option value="" disabled>Select an instrument</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Select label="Teacher" name="teacherId" defaultValue="">
                <option value="">Unassigned</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
              <BatchScheduleFields />
              <Input label="Room" name="room" placeholder="e.g. Room 1" />
              <Button type="submit" className="w-full">Add batch</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
