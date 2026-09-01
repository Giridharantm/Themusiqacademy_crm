import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { markStudentPresentAsAdmin, unmarkStudentAsAdmin } from "@/lib/actions/attendance-actions";
import { Card, CardBody, CardHeader, PageHeader, Badge, Button, Select, EmptyState } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { SubscriptionProgress } from "@/components/subscription-progress";
import { AttendanceRoster } from "@/components/attendance-roster";
import { subscriptionTotals, renewalUrgency, countUsedClasses, attendanceForSubscription } from "@/lib/subscription";
import { DAY_LABELS, dayCodeFromDate, formatTimeLabel } from "@/lib/schedule";
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

function attendanceRate(attendance: { status: string }[]) {
  if (attendance.length === 0) return null;
  const good = attendance.filter((a) => a.status === "PRESENT").length;
  return Math.round((good / attendance.length) * 100);
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    courseId?: string;
    date?: string;
    q?: string;
    studentId?: string;
  }>;
}) {
  const { courseId, date: dateParam, q, studentId } = await searchParams;
  const today = toDateInputValue(new Date());
  const selectedDate = dateParam || today;

  const courses = await prisma.course.findMany({ orderBy: { name: "asc" } });
  const selectedCourse = courseId ? courses.find((c) => c.id === courseId) : null;

  type RosterStudent = { id: string; name: string; marked: boolean };
  let batchGroups: { batchId: string; label: string; students: RosterStudent[] }[] = [];
  let otherStudents: RosterStudent[] = [];
  let addableStudents: { id: string; name: string; studentCode: string }[] = [];

  if (selectedCourse) {
    const selectedDayCode = dayCodeFromDate(parseDateOnly(selectedDate));
    const [enrollments, sameCourseEnrollments, existingAttendance] = await Promise.all([
      // Only students actually scheduled for this instrument on this day of
      // the week — a Tue/Thu Guitar student shouldn't default into a
      // Wednesday Guitar roster just because they take the same instrument.
      prisma.enrollment.findMany({
        where: { status: "ACTIVE", batch: { courseId: selectedCourse.id, dayOfWeek: selectedDayCode } },
        include: { student: true, batch: { include: { teacher: true } } },
        orderBy: [{ batch: { startTime: "asc" } }, { student: { name: "asc" } }],
      }),
      // Same instrument, any day — this instrument's own reschedule/comp
      // pool. The search only ever offers students of the instrument you're
      // marking, not the whole academy.
      prisma.enrollment.findMany({
        where: { status: "ACTIVE", student: { status: "ACTIVE" }, batch: { courseId: selectedCourse.id } },
        include: { student: true },
        orderBy: { student: { name: "asc" } },
      }),
      prisma.attendance.findMany({ where: { courseId: selectedCourse.id, date: parseDateOnly(selectedDate) }, include: { student: true } }),
    ]);

    const markedIds = new Set(existingAttendance.map((a) => a.studentId));

    // Group the roster by batch — a class can run several time slots on the
    // same day, and a teacher marking 30+ students needs to see which
    // batch each one belongs to, not one flat alphabetical list.
    const groupMap = new Map<string, { batchId: string; label: string; students: RosterStudent[] }>();
    for (const e of enrollments) {
      const b = e.batch;
      if (!groupMap.has(b.id)) {
        const teacherLabel = b.teacher ? b.teacher.name : "Unassigned";
        groupMap.set(b.id, {
          batchId: b.id,
          label: `${formatTimeLabel(b.startTime)} - ${formatTimeLabel(b.endTime)} · ${teacherLabel}`,
          students: [],
        });
      }
      groupMap.get(b.id)!.students.push({ id: e.studentId, name: e.student.name, marked: markedIds.has(e.studentId) });
    }
    batchGroups = Array.from(groupMap.values());

    const groupedIds = new Set(batchGroups.flatMap((g) => g.students.map((s) => s.id)));
    otherStudents = existingAttendance
      .filter((a) => !groupedIds.has(a.studentId))
      .map((a) => ({ id: a.studentId, name: a.student.name, marked: true }));

    const otherIds = new Set(otherStudents.map((s) => s.id));
    const sameCourseMap = new Map(sameCourseEnrollments.map((e) => [e.studentId, e.student]));
    addableStudents = Array.from(sameCourseMap.values())
      .filter((s) => !groupedIds.has(s.id) && !otherIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, studentCode: s.studentCode }));
  }

  const totalRosterCount = batchGroups.reduce((sum, g) => sum + g.students.length, 0) + otherStudents.length;
  const markedRosterCount =
    batchGroups.reduce((sum, g) => sum + g.students.filter((s) => s.marked).length, 0) + otherStudents.length;

  const students = await prisma.student.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
            { studentCode: { contains: q } },
          ],
        }
      : undefined,
    include: {
      attendance: true,
      subscriptions: { where: { status: "ACTIVE" }, include: { bonusGrants: true } },
    },
    orderBy: { name: "asc" },
  });

  const selectedStudent = studentId
    ? await prisma.student.findUnique({
        where: { id: studentId },
        include: {
          attendance: { orderBy: { date: "desc" }, include: { course: true } },
          subscriptions: { where: { status: "ACTIVE" }, include: { bonusGrants: true, course: true } },
        },
      })
    : null;

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Mark students present as they arrive, or look up a student's history" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="h-fit">
          <CardHeader title="Mark attendance" />
          <CardBody>
            <form method="get" className="space-y-3">
              {studentId && <input type="hidden" name="studentId" value={studentId} />}
              <Select label="Instrument" name="courseId" required defaultValue={courseId ?? ""}>
                <option value="" disabled>Select an instrument</option>
                {courses.map((c) => (
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
          </CardBody>
        </Card>

        <div className="lg:col-span-2">
          {!selectedCourse ? (
            <Card>
              <CardBody>
                <EmptyState text="Pick an instrument and date to mark that day's attendance" />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title={`${selectedCourse.name} · ${format(parseDateOnly(selectedDate), "EEEE, d MMM yyyy")}`}
                subtitle={`${totalRosterCount} student${totalRosterCount !== 1 ? "s" : ""} scheduled on ${DAY_LABELS[dayCodeFromDate(parseDateOnly(selectedDate))]}s`}
              />
              <CardBody>
                <AttendanceRoster
                  courseId={selectedCourse.id}
                  dateStr={selectedDate}
                  batchGroups={batchGroups}
                  otherStudents={otherStudents}
                  addableStudents={addableStudents}
                  markedCount={markedRosterCount}
                  totalCount={totalRosterCount}
                  markAction={markStudentPresentAsAdmin}
                  unmarkAction={unmarkStudentAsAdmin}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="h-fit">
          <CardHeader title="Student history" action={<SearchBox placeholder="Search students..." defaultValue={q} extraParams={{ studentId }} />} />
          {students.length === 0 ? (
            <CardBody>
              <EmptyState text="No students match your search" />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {students.map((s) => {
                const rate = attendanceRate(s.attendance);
                const urgencies = s.subscriptions.map((sub) => {
                  const courseAttendance = s.attendance.filter((a) => a.courseId === sub.courseId);
                  const used = countUsedClasses(attendanceForSubscription(sub.startDate, courseAttendance));
                  return renewalUrgency(subscriptionTotals(sub, used).remaining);
                });
                const urgency = urgencies.includes("due") ? "due" : urgencies.includes("soon") ? "soon" : null;
                return (
                  <li key={s.id}>
                    <Link
                      href={`/admin/attendance?studentId=${s.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                      className={`flex items-center justify-between px-5 py-3 hover:bg-slate-50 ${studentId === s.id ? "bg-indigo-50" : ""}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.studentCode}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {urgency === "due" && <Badge color="red">Renew now</Badge>}
                        {urgency === "soon" && <Badge color="yellow">Renew soon</Badge>}
                        {rate === null ? <Badge>No data</Badge> : <Badge color={rate >= 80 ? "green" : rate >= 60 ? "yellow" : "red"}>{rate}%</Badge>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {!selectedStudent ? (
            <Card>
              <CardBody>
                <EmptyState text="Select a student to view their combined attendance history and subscriptions" />
              </CardBody>
            </Card>
          ) : (
            (() => {
              const courseIds = Array.from(new Set(selectedStudent.attendance.map((a) => a.courseId)));
              if (courseIds.length === 0) {
                return (
                  <Card>
                    <CardHeader title={selectedStudent.name} />
                    <CardBody>
                      <EmptyState text="No attendance recorded for this student yet" />
                    </CardBody>
                  </Card>
                );
              }
              return courseIds.map((courseId) => {
                const courseAttendance = selectedStudent.attendance.filter((a) => a.courseId === courseId);
                const courseName = courseAttendance[0].course.name;
                const subscription = selectedStudent.subscriptions.find((s) => s.courseId === courseId);
                const rate = attendanceRate(courseAttendance);
                const present = courseAttendance.filter((a) => a.status === "PRESENT").length;
                const absent = courseAttendance.filter((a) => a.status === "ABSENT").length;

                return (
                  <Card key={courseId}>
                    <CardHeader
                      title={`${selectedStudent.name} · ${courseName}`}
                      action={rate === null ? <Badge>No data</Badge> : <Badge color={rate >= 80 ? "green" : rate >= 60 ? "yellow" : "red"}>{rate}% attendance</Badge>}
                    />
                    {subscription && (
                      <CardBody className="border-b border-slate-100 bg-slate-50">
                        <SubscriptionProgress subscription={subscription} attendance={courseAttendance} />
                      </CardBody>
                    )}
                    <CardBody>
                      <p className="text-xs text-slate-400 mb-2">
                        {courseAttendance.length} classes recorded · {present} present · {absent} absent
                      </p>
                      <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                        {courseAttendance.map((a) => (
                          <li key={a.id} className="py-2 flex items-center justify-between text-sm">
                            <span className="text-slate-600">{format(a.date, "EEEE, d MMM yyyy")}</span>
                            <Badge color={a.status === "PRESENT" ? "green" : "red"}>{a.status}</Badge>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                );
              });
            })()
          )}
        </div>
      </div>
    </div>
  );
}
