import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  updateTeacher,
  updateTeacherStatus,
  deleteTeacher,
  reassignBatch,
  reassignAllBatches,
} from "@/lib/actions/user-actions";
import { Card, CardBody, CardHeader, PageHeader, Badge, Input, Select, Button, EmptyState } from "@/components/ui";
import { DAY_LABELS, formatTimeLabel } from "@/lib/schedule";

export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const teacher = await prisma.user.findUnique({
    where: { id, role: "TEACHER" },
    include: {
      batchesTaught: { include: { course: true, _count: { select: { enrollments: true } } }, orderBy: { name: "asc" } },
      _count: { select: { homeworkGiven: true, feedbackGiven: true, attendanceMarked: true } },
    },
  });

  if (!teacher) notFound();

  const otherActiveTeachers = await prisma.user.findMany({
    where: { role: "TEACHER", status: "ACTIVE", id: { not: teacher.id } },
    orderBy: { name: "asc" },
  });

  const historyCount = teacher._count.homeworkGiven + teacher._count.feedbackGiven + teacher._count.attendanceMarked;
  const canDelete = teacher.batchesTaught.length === 0 && historyCount === 0;

  return (
    <div>
      <PageHeader
        title={teacher.name}
        subtitle={`${teacher.email}${teacher.phone ? " · " + teacher.phone : ""}`}
        action={
          <div className="flex items-center gap-2">
            {teacher.status === "INACTIVE" && <Badge color="slate">Inactive</Badge>}
            <form action={async () => {
              "use server";
              await updateTeacherStatus(teacher.id, teacher.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
            }}>
              <Button type="submit" variant="secondary">
                {teacher.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
              </Button>
            </form>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Batches" subtitle="Reassign individually, or move everything at once" />
            {teacher.batchesTaught.length === 0 ? (
              <CardBody>
                <EmptyState text="No batches assigned" />
              </CardBody>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {teacher.batchesTaught.map((b) => (
                    <li key={b.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <Link href={`/admin/batches/${b.id}`} className="text-sm text-slate-900 hover:text-indigo-600">
                          {b.course.name} · {DAY_LABELS[b.dayOfWeek]} · {formatTimeLabel(b.startTime)}
                        </Link>
                        <p className="text-xs text-slate-400 mt-0.5">{b._count.enrollments} student{b._count.enrollments !== 1 ? "s" : ""}</p>
                      </div>
                      <form action={reassignBatch.bind(null, b.id)} className="flex items-center gap-2">
                        <select
                          name="teacherId"
                          defaultValue=""
                          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Unassign</option>
                          {otherActiveTeachers.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <Button type="submit" variant="secondary">Reassign</Button>
                      </form>
                    </li>
                  ))}
                </ul>
                {otherActiveTeachers.length > 0 && (
                  <CardBody className="border-t border-slate-100">
                    <form action={reassignAllBatches.bind(null, teacher.id)} className="flex items-end gap-2">
                      <div className="flex-1">
                        <Select label="Reassign ALL batches to" name="toTeacherId" required defaultValue="">
                          <option value="" disabled>Select a teacher</option>
                          {otherActiveTeachers.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </Select>
                      </div>
                      <Button type="submit" variant="secondary">Move all</Button>
                    </form>
                  </CardBody>
                )}
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="Edit details" />
            <CardBody>
              <form action={updateTeacher.bind(null, teacher.id)} className="space-y-3 max-w-md">
                <Input label="Name" name="name" defaultValue={teacher.name} required />
                <Input label="Email" name="email" type="email" defaultValue={teacher.email} required />
                <Input label="Phone" name="phone" defaultValue={teacher.phone ?? ""} />
                <Button type="submit" className="w-full">Save changes</Button>
              </form>
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Remove account" />
          <CardBody>
            {canDelete ? (
              <>
                <p className="text-sm text-slate-500 mb-3">No batches or history are attached — this account can be deleted outright.</p>
                <form action={deleteTeacher.bind(null, teacher.id)}>
                  <Button type="submit" variant="danger" className="w-full">Delete teacher</Button>
                </form>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                This teacher has {teacher.batchesTaught.length} batch{teacher.batchesTaught.length !== 1 ? "es" : ""} and/or history
                (homework, feedback or attendance they&apos;ve marked) attached, so deleting would either be blocked or lose that
                attribution. Reassign their batches above, then use <span className="font-medium">Deactivate</span> instead — their
                login is disabled but their history stays intact.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
