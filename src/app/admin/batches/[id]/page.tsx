import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, PageHeader, Badge, EmptyState } from "@/components/ui";
import { DAY_LABELS, formatTimeLabel } from "@/lib/schedule";

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      course: true,
      teacher: true,
      enrollments: { include: { student: true }, orderBy: { createdAt: "asc" } },
      homework: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!batch) notFound();

  return (
    <div>
      <PageHeader
        title={batch.name}
        subtitle={`${batch.course.name} · ${DAY_LABELS[batch.dayOfWeek]} · ${formatTimeLabel(batch.startTime)} - ${formatTimeLabel(batch.endTime)} · ${batch.room ?? "No room"}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Roster" subtitle={`Teacher: ${batch.teacher?.name ?? "Unassigned"}`} />
            {batch.enrollments.length === 0 ? (
              <CardBody>
                <EmptyState text="No students enrolled in this batch yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {batch.enrollments.map((e) => (
                  <li key={e.id} className="px-5 py-3 flex items-center justify-between">
                    <Link href={`/admin/students/${e.studentId}`} className="text-sm font-medium text-slate-900 hover:text-indigo-600">
                      {e.student.name}
                    </Link>
                    <Badge color={e.status === "ACTIVE" ? "green" : "slate"}>{e.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Recent homework" />
          {batch.homework.length === 0 ? (
            <CardBody>
              <EmptyState text="No homework assigned yet" />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {batch.homework.map((h) => (
                <li key={h.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-900">{h.title}</p>
                  {h.description && <p className="text-xs text-slate-500 mt-0.5">{h.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
