import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { Card, CardBody, PageHeader, Badge, EmptyState } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { DAY_LABELS, formatTimeLabel, sortBatches } from "@/lib/schedule";

export default async function TeacherDashboard({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireRole("TEACHER");
  const { q } = await searchParams;

  const batchesRaw = await prisma.batch.findMany({
    where: {
      teacherId: user.id,
      ...(q ? { OR: [{ name: { contains: q } }, { course: { name: { contains: q } } }] } : {}),
    },
    include: { course: true, _count: { select: { enrollments: true } } },
  });
  const batches = sortBatches(batchesRaw);

  const todayCode = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][new Date().getDay()];

  return (
    <div>
      <PageHeader
        title="My Batches"
        subtitle="Your class schedule and homework — for attendance, see the Attendance tab"
        action={<SearchBox placeholder="Search batches..." defaultValue={q} />}
      />

      {batches.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState text={q ? "No batches match your search" : "No batches assigned to you yet"} />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {batches.map((b) => {
            const today = b.dayOfWeek === todayCode;
            return (
              <Link key={b.id} href={`/teacher/batches/${b.id}`}>
                <Card className="hover:border-indigo-300 transition-colors">
                  <CardBody>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{b.course.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{DAY_LABELS[b.dayOfWeek]} · {formatTimeLabel(b.startTime)} - {formatTimeLabel(b.endTime)}</p>
                      </div>
                      {today && <Badge color="green">Today</Badge>}
                    </div>
                    <p className="text-xs text-slate-400 mt-3">{b.room ?? "No room"}</p>
                    <p className="text-xs text-slate-400 mt-1">{b._count.enrollments} student(s) enrolled</p>
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
