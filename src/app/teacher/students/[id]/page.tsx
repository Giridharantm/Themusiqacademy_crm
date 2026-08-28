import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { addFeedback } from "@/lib/actions/teacher-actions";
import { Card, CardBody, CardHeader, PageHeader, Badge, Textarea, Button, EmptyState } from "@/components/ui";
import { DAY_LABELS, formatTimeLabel } from "@/lib/schedule";
import { format } from "date-fns";

function attendanceRate(attendance: { status: string }[]) {
  if (attendance.length === 0) return null;
  const good = attendance.filter((a) => a.status === "PRESENT").length;
  return Math.round((good / attendance.length) * 100);
}

export default async function TeacherStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("TEACHER");
  const { id } = await params;

  const [student, myBatches] = await Promise.all([
    prisma.student.findUnique({
      where: { id },
      include: {
        enrollments: {
          where: { status: "ACTIVE" },
          include: { batch: { include: { course: true } } },
        },
        attendance: {
          include: { course: true },
          orderBy: { date: "desc" },
        },
        feedback: { orderBy: { date: "desc" }, include: { teacher: true } },
      },
    }),
    prisma.batch.findMany({ where: { teacherId: user.id }, select: { courseId: true } }),
  ]);

  if (!student) notFound();

  const myCourseIds = new Set(myBatches.map((b) => b.courseId));
  const myEnrollments = student.enrollments.filter((e) => e.batch.teacherId === user.id);
  const myAttendance = student.attendance.filter((a) => myCourseIds.has(a.courseId));
  if (myEnrollments.length === 0 && myAttendance.length === 0) notFound();

  const courseIds = Array.from(new Set([...myEnrollments.map((e) => e.batch.courseId), ...myAttendance.map((a) => a.courseId)]));

  return (
    <div>
      <PageHeader
        title={student.name}
        subtitle="Mark attendance for this student from the Attendance tab"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {courseIds.map((courseId) => {
            const courseEnrollments = myEnrollments.filter((e) => e.batch.courseId === courseId);
            const courseAttendance = myAttendance.filter((a) => a.courseId === courseId);
            const courseName = courseEnrollments[0] ? courseEnrollments[0].batch.course.name : courseAttendance[0].course.name;
            const rate = attendanceRate(courseAttendance);
            const present = courseAttendance.filter((a) => a.status === "PRESENT").length;
            const absent = courseAttendance.filter((a) => a.status === "ABSENT").length;
            return (
              <Card key={courseId}>
                <CardHeader
                  title={courseName}
                  subtitle={courseEnrollments.map((e) => `${DAY_LABELS[e.batch.dayOfWeek]} ${formatTimeLabel(e.batch.startTime)}`).join(", ")}
                  action={rate === null ? <Badge>No data</Badge> : <Badge color={rate >= 80 ? "green" : rate >= 60 ? "yellow" : "red"}>{rate}%</Badge>}
                />
                <CardBody>
                  <p className="text-xs text-slate-400 mb-2">
                    {courseAttendance.length} classes recorded · {present} present · {absent} absent
                  </p>
                  {courseAttendance.length === 0 ? (
                    <EmptyState text="No attendance recorded yet" />
                  ) : (
                    <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                      {courseAttendance.map((a) => (
                        <li key={a.id} className="py-2 flex items-center justify-between text-sm">
                          <span className="text-slate-600">{format(a.date, "d MMM yyyy")}</span>
                          <Badge color={a.status === "PRESENT" ? "green" : "red"}>{a.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            );
          })}

          <Card>
            <CardHeader title="Add feedback" />
            <CardBody>
              <form action={addFeedback.bind(null, student.id)} className="space-y-3">
                <Textarea label="Feedback note" name="note" placeholder="How is the student progressing?" required />
                <Button type="submit" className="w-full">Save feedback</Button>
              </form>
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Feedback history" />
          {student.feedback.length === 0 ? (
            <CardBody>
              <EmptyState text="No feedback yet" />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {student.feedback.map((f) => (
                <li key={f.id} className="px-5 py-3">
                  <p className="text-sm text-slate-900">{f.note}</p>
                  <p className="text-xs text-slate-400 mt-1">{f.teacher?.name ?? "Teacher"} · {format(f.date, "d MMM yyyy")}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-xs text-slate-400 mt-4">
        Need to mark or correct attendance? Go to <Link href="/teacher/attendance" className="text-indigo-600 hover:underline">Attendance</Link> and pick the instrument and date.
      </p>
    </div>
  );
}
