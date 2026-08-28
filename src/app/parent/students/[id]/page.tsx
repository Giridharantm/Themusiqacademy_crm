import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { Card, CardBody, CardHeader, PageHeader, Badge, EmptyState } from "@/components/ui";
import { SubscriptionProgress } from "@/components/subscription-progress";
import { DAY_LABELS, formatTimeLabel } from "@/lib/schedule";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  PRESENT: "green",
  ABSENT: "red",
  PENDING: "yellow",
  PARTIAL: "blue",
  PAID: "green",
  OVERDUE: "red",
  CANCELLED: "slate",
};

export default async function ParentStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("PARENT");
  const { id } = await params;

  const link = await prisma.studentGuardian.findUnique({
    where: { studentId_userId: { studentId: id, userId: user.id } },
  });
  if (!link) notFound();

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: {
          batch: { include: { course: true, teacher: true } },
        },
      },
      attendance: {
        include: { course: true },
        orderBy: { date: "desc" },
      },
      subscriptions: {
        where: { status: "ACTIVE" },
        include: { bonusGrants: true, course: true },
      },
      invoices: { orderBy: { issueDate: "desc" }, include: { payments: true } },
      feedback: { orderBy: { date: "desc" }, include: { teacher: true } },
    },
  });
  if (!student) notFound();

  const courseIds = Array.from(new Set(student.enrollments.map((e) => e.batch.courseId)));

  const batchIds = student.enrollments.map((e) => e.batchId);
  const homework = await prisma.homework.findMany({
    where: { batchId: { in: batchIds } },
    include: { batch: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div>
      <PageHeader title={student.name} subtitle={`Status: ${student.status}`} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Classes & subscription" />
            {courseIds.length === 0 ? (
              <CardBody>
                <EmptyState text="Not enrolled in any class yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {courseIds.map((courseId) => {
                  const courseEnrollments = student.enrollments.filter((e) => e.batch.courseId === courseId);
                  const courseName = courseEnrollments[0].batch.course.name;
                  const activeSubscription = student.subscriptions.find((s) => s.courseId === courseId);
                  return (
                    <li key={courseId} className="px-5 py-4">
                      <p className="text-sm font-medium text-slate-900 mb-2">{courseName}</p>
                      <ul className="space-y-1.5 mb-3">
                        {courseEnrollments.map((e) => (
                          <li key={e.id} className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-1.5">
                            <span className="text-xs text-slate-700">
                              {DAY_LABELS[e.batch.dayOfWeek]} · {formatTimeLabel(e.batch.startTime)} - {formatTimeLabel(e.batch.endTime)} · {e.batch.teacher?.name ?? "Unassigned"}
                            </span>
                            <Badge color={e.status === "ACTIVE" ? "green" : "slate"}>{e.status}</Badge>
                          </li>
                        ))}
                      </ul>
                      {activeSubscription ? (
                        <SubscriptionProgress subscription={activeSubscription} attendance={student.attendance.filter((a) => a.courseId === courseId)} />
                      ) : (
                        <p className="text-xs text-slate-400">No active subscription — please contact the academy office.</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Attendance log" />
            {student.attendance.length === 0 ? (
              <CardBody>
                <EmptyState text="No attendance recorded yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {student.attendance.map((a) => (
                  <li key={a.id} className="px-5 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-slate-700">{format(a.date, "d MMM yyyy")} · {a.course.name}</span>
                    <Badge color={statusColors[a.status]}>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Fees" />
            {student.invoices.length === 0 ? (
              <CardBody>
                <EmptyState text="No invoices yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {student.invoices.map((inv) => {
                  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
                  return (
                    <li key={inv.id} className="px-5 py-3 flex items-center justify-between text-sm">
                      <div>
                        <p className="text-slate-900 font-medium">{inv.invoiceNumber}</p>
                        <p className="text-xs text-slate-500">Due {format(inv.dueDate, "d MMM yyyy")} · Rs. {paid.toLocaleString("en-IN")} of {inv.total.toLocaleString("en-IN")} paid</p>
                      </div>
                      <Badge color={statusColors[inv.status]}>{inv.status}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Homework & assignments" />
            {homework.length === 0 ? (
              <CardBody>
                <EmptyState text="No homework assigned yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {homework.map((h) => (
                  <li key={h.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-900">{h.title}</p>
                    <p className="text-xs text-slate-500">{h.batch.name}</p>
                    {h.description && <p className="text-xs text-slate-500 mt-0.5">{h.description}</p>}
                    {h.dueDate && <p className="text-xs text-slate-400 mt-1">Due {format(h.dueDate, "d MMM yyyy")}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Teacher feedback" />
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
      </div>
    </div>
  );
}
