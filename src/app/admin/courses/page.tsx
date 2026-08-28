import { prisma } from "@/lib/prisma";
import { createCourse, deleteCourse } from "@/lib/actions/course-actions";
import { Card, CardBody, CardHeader, PageHeader, Input, Textarea, Button, EmptyState, Badge } from "@/components/ui";
import { SearchBox } from "@/components/search-box";

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;

  const courses = await prisma.course.findMany({
    where: q ? { name: { contains: q } } : undefined,
    include: { _count: { select: { batches: true, leads: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle="Instruments offered by the academy"
        action={<SearchBox placeholder="Search courses..." defaultValue={q} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            {courses.length === 0 ? (
              <CardBody>
                <EmptyState text={q ? "No courses match your search" : "No courses added yet"} />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {courses.map((c) => (
                  <li key={c.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{c.durationMinutes} min sessions</p>
                      {c.description && <p className="text-xs text-slate-400 mt-1">{c.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{c._count.batches} batch{c._count.batches !== 1 ? "es" : ""}</Badge>
                      <form action={deleteCourse.bind(null, c.id)}>
                        <Button type="submit" variant="ghost">Delete</Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="New course" />
          <CardBody>
            <form action={createCourse} className="space-y-3">
              <Input label="Course name" name="name" required placeholder="e.g. Guitar - Beginner" />
              <Textarea label="Description" name="description" />
              <Input label="Session duration (minutes)" name="durationMinutes" type="number" min="15" step="5" defaultValue={60} />
              <Button type="submit" className="w-full">Add course</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
