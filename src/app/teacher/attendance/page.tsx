import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { markBulkAttendanceAsTeacher } from "@/lib/actions/teacher-actions";
import { Card, CardBody, CardHeader, PageHeader, Button, Select, EmptyState } from "@/components/ui";
import { BulkAttendanceFields } from "@/components/bulk-attendance-fields";
import { DAY_LABELS, dayCodeFromDate } from "@/lib/schedule";
import { format } from "date-fns";

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default async function TeacherAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; date?: string }>;
}) {
  const user = await requireRole("TEACHER");
  const { courseId, date: dateParam } = await searchParams;
  const today = toDateInputValue(new Date());
  const selectedDate = dateParam || today;

  const myBatches = await prisma.batch.findMany({ where: { teacherId: user.id }, include: { course: true } });
  const myCourses = Array.from(new Map(myBatches.map((b) => [b.courseId, b.course.name])).entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ id, name }));

  const selectedCourse = courseId ? myCourses.find((c) => c.id === courseId) : null;

  let roster: { id: string; name: string }[] = [];
  let additionalAttendees: { id: string; name: string }[] = [];
  let addableStudents: { id: string; name: string; studentCode: string }[] = [];

  if (selectedCourse) {
    const selectedDayCode = dayCodeFromDate(parseDateOnly(selectedDate));
    const [enrollments, sameCourseEnrollments, existingAttendance] = await Promise.all([
      // Only students actually scheduled with this teacher for this
      // instrument on this day of the week — a Tue/Thu student shouldn't
      // default into a Wednesday roster just because they take the same
      // instrument with this teacher on other days.
      prisma.enrollment.findMany({
        where: { status: "ACTIVE", batch: { courseId: selectedCourse.id, teacherId: user.id, dayOfWeek: selectedDayCode } },
        include: { student: true },
        orderBy: { student: { name: "asc" } },
      }),
      // Same instrument with this teacher, any day — this instrument's own
      // reschedule/comp pool. The search only ever offers students of the
      // instrument you're marking, not the whole academy.
      prisma.enrollment.findMany({
        where: { status: "ACTIVE", student: { status: "ACTIVE" }, batch: { courseId: selectedCourse.id, teacherId: user.id } },
        include: { student: true },
        orderBy: { student: { name: "asc" } },
      }),
      prisma.attendance.findMany({ where: { courseId: selectedCourse.id, date: parseDateOnly(selectedDate) }, include: { student: true } }),
    ]);
    // A student can hold several of the teacher's same-day batches for the
    // same instrument (rare, but possible) — dedupe.
    const rosterMap = new Map<string, string>();
    for (const e of enrollments) rosterMap.set(e.studentId, e.student.name);
    roster = Array.from(rosterMap, ([id, name]) => ({ id, name }));
    const rosterIds = new Set(roster.map((r) => r.id));
    additionalAttendees = existingAttendance
      .filter((a) => !rosterIds.has(a.studentId))
      .map((a) => ({ id: a.studentId, name: a.student.name }));
    const sameCourseMap = new Map(sameCourseEnrollments.map((e) => [e.studentId, e.student]));
    addableStudents = Array.from(sameCourseMap.values())
      .filter((s) => !rosterIds.has(s.id) && !additionalAttendees.some((a) => a.id === s.id))
      .map((s) => ({ id: s.id, name: s.name, studentCode: s.studentCode }));
  }

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Pick an instrument and date to mark that class" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="h-fit">
          <CardHeader title="Mark attendance" />
          <CardBody>
            {myCourses.length === 0 ? (
              <EmptyState text="No batches assigned to you yet" />
            ) : (
              <form method="get" className="space-y-3">
                <Select label="Instrument" name="courseId" required defaultValue={courseId ?? ""}>
                  <option value="" disabled>Select an instrument</option>
                  {myCourses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 mb-1">Date</span>
                  <input
                    type="date"
                    name="date"
                    defaultValue={selectedDate}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </label>
                <Button type="submit" className="w-full">Load class</Button>
              </form>
            )}
          </CardBody>
        </Card>

        <div className="lg:col-span-2">
          {!selectedCourse ? (
            <Card>
              <CardBody>
                <EmptyState text="Select an instrument and date on the left to mark attendance" />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title={`${selectedCourse.name} · ${format(parseDateOnly(selectedDate), "EEEE, d MMM yyyy")}`}
                subtitle={`${roster.length} student${roster.length !== 1 ? "s" : ""} enrolled in your ${selectedCourse.name} batches on ${DAY_LABELS[dayCodeFromDate(parseDateOnly(selectedDate))]}s`}
              />
              <CardBody>
                <form action={markBulkAttendanceAsTeacher.bind(null, selectedCourse.id, selectedDate)} className="space-y-4">
                  <BulkAttendanceFields
                    key={`${selectedCourse.id}-${selectedDate}`}
                    roster={roster}
                    additionalAttendees={additionalAttendees}
                    addableStudents={addableStudents}
                  />
                  <Button type="submit" className="w-full">Save attendance for {format(parseDateOnly(selectedDate), "d MMM yyyy")}</Button>
                </form>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
