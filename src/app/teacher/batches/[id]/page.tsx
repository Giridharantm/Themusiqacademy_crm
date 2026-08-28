import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { createHomework } from "@/lib/actions/teacher-actions";
import { Card, CardBody, CardHeader, PageHeader, Badge, Input, Textarea, Button, EmptyState } from "@/components/ui";
import { DAY_LABELS, formatTimeLabel } from "@/lib/schedule";
import { format } from "date-fns";

export default async function TeacherBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("TEACHER");
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      course: true,
      enrollments: { where: { status: "ACTIVE" }, include: { student: true }, orderBy: { createdAt: "asc" } },
      homework: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!batch || batch.teacherId !== user.id) notFound();

  return (
    <div>
      <PageHeader title={batch.name} subtitle={`${batch.course.name} · ${DAY_LABELS[batch.dayOfWeek]} · ${formatTimeLabel(batch.startTime)} - ${formatTimeLabel(batch.endTime)}`} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Students" subtitle="Mark attendance and give feedback from a student's page" />
            {batch.enrollments.length === 0 ? (
              <CardBody>
                <EmptyState text="No students enrolled in this batch" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {batch.enrollments.map((e) => (
                  <li key={e.id} className="px-5 py-3 flex items-center justify-between">
                    <Link href={`/teacher/students/${e.studentId}`} className="text-sm font-medium text-slate-900 hover:text-indigo-600">
                      {e.student.name}
                    </Link>
                    <Badge>Open</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent homework" />
            {batch.homework.length === 0 ? (
              <CardBody>
                <EmptyState text="Nothing assigned yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {batch.homework.map((h) => (
                  <li key={h.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-900">{h.title}</p>
                    {h.description && <p className="text-xs text-slate-500 mt-0.5">{h.description}</p>}
                    {h.dueDate && <p className="text-xs text-slate-400 mt-1">Due {format(h.dueDate, "d MMM yyyy")}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Assign homework" subtitle="Goes out to everyone in this batch" />
          <CardBody>
            <form action={createHomework.bind(null, batch.id)} className="space-y-3">
              <Input label="Title" name="title" required />
              <Textarea label="Description" name="description" />
              <Input label="Due date" name="dueDate" type="date" />
              <Button type="submit" className="w-full">Assign</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
