import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createStudent } from "@/lib/actions/student-actions";
import { Card, CardBody, CardHeader, PageHeader, Input, Select, Button, EmptyState, Badge } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { DownloadCsvLink } from "@/components/download-csv-link";
import { StudentFilterFields } from "@/components/student-filter-fields";
import { getStudentList } from "@/lib/student-list";
import { normalizeSearchQuery } from "@/lib/search";
import { format } from "date-fns";

const URGENCY_COLORS: Record<string, string> = { ok: "green", soon: "yellow", due: "red" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; courseId?: string; renewal?: string; sort?: string }>;
}) {
  const { q: rawQ, status, courseId, renewal, sort } = await searchParams;
  const q = normalizeSearchQuery(rawQ);

  const [{ students: filtered, relevantSubs }, courses] = await Promise.all([
    getStudentList({ q: rawQ, status, courseId, renewal, sort }),
    prisma.course.findMany({ orderBy: { name: "asc" } }),
  ]);

  const courseOptions = courses.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Active students by default — use the status filter to include inactive ones"
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <SearchBox placeholder="Search by name, ID, phone..." defaultValue={q} extraParams={{ status, courseId, renewal, sort }} />
            <DownloadCsvLink href="/admin/students/export" params={{ q, status, courseId, renewal, sort }} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader
              title={`${filtered.length} student${filtered.length !== 1 ? "s" : ""}`}
              action={
                <form method="get" className="w-full">
                  {q && <input type="hidden" name="q" value={q} />}
                  <StudentFilterFields
                    courseOptions={courseOptions}
                    selectedStatus={status ?? "ACTIVE"}
                    selectedCourseId={courseId}
                    selectedRenewal={renewal}
                    selectedSort={sort}
                  />
                </form>
              }
            />
            {filtered.length === 0 ? (
              <CardBody>
                <EmptyState
                  text={
                    q
                      ? "No students match your search"
                      : status || courseId || renewal
                        ? "No students match these filters"
                        : "No students yet. Convert a lead or add one directly."
                  }
                />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <li key={s.id}>
                    <Link href={`/admin/students/${s.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {s.name} <span className="text-xs font-normal text-slate-400">{s.studentCode}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {s.enrollments.length === 0
                            ? "Not enrolled in any batch"
                            : s.enrollments.map((e) => e.batch.name).join(", ")}
                        </p>
                        {relevantSubs(s).length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {relevantSubs(s).map((sub, i) => (
                              <li key={i} className="text-xs text-slate-500 flex items-center gap-1.5">
                                <Badge color={URGENCY_COLORS[sub.urgency]}>{sub.courseName}</Badge>
                                <span>
                                  {sub.used} of {sub.totalClasses} used · {sub.remaining} left
                                  {sub.endDate && ` · renews ${format(sub.endDate, "d MMM yyyy")}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Badge color={s.status === "ACTIVE" ? "green" : "slate"}>{s.status}</Badge>
                        <span className="text-xs text-slate-400">Joined {format(s.joinDate, "d MMM yyyy")}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Add student directly" subtitle="For students not coming through a lead" />
          <CardBody>
            <form action={createStudentAndRedirect} className="space-y-3">
              <Input label="Name" name="name" required />
              <Input label="Date of birth" name="dob" type="date" />
              <Select label="Gender" name="gender" defaultValue="">
                <option value="">Not specified</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
              <Input label="Phone" name="phone" />
              <Input label="Email" name="email" type="email" />
              <Button type="submit" className="w-full">Add student</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

async function createStudentAndRedirect(formData: FormData) {
  "use server";
  const { redirect } = await import("next/navigation");
  const id = await createStudent(formData);
  redirect(`/admin/students/${id}`);
}
