import { prisma } from "@/lib/prisma";
import { createCourse, deleteCourse, updateCourseRules } from "@/lib/actions/course-actions";
import { Card, CardBody, CardHeader, PageHeader, Input, Textarea, Button, EmptyState, Badge } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { normalizeSearchQuery } from "@/lib/search";

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = normalizeSearchQuery((await searchParams).q);

  const courses = await prisma.course.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
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
                      <p className="text-xs text-slate-500 mt-1">
                        {c.maxStudents ? `Up to ${c.maxStudents} students per class` : "No limit per class"} ·{" "}
                        {c.canMoveDay ? "Make-ups can move to another day" : "Make-ups only at another time the same day"}
                      </p>
                      <details className="mt-1.5" key={`${c.maxStudents}-${c.canMoveDay}`}>
                        <summary className="text-xs text-indigo-600 hover:underline cursor-pointer list-none">Class size and make-up rules</summary>
                        <form action={updateCourseRules.bind(null, c.id)} className="mt-2 space-y-3 max-w-xs">
                          <Input label="Most students in one class" name="maxStudents" type="number" min="1" defaultValue={c.maxStudents ?? ""} hint="Leave blank for no limit" />
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" name="canMoveDay" defaultChecked={c.canMoveDay} />
                            A missed class can be made up on another day
                          </label>
                          <Button type="submit" variant="secondary">Save</Button>
                        </form>
                      </details>
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
