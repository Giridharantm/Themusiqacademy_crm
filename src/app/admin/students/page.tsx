import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createStudent } from "@/lib/actions/student-actions";
import { Card, CardBody, CardHeader, PageHeader, Input, Select, Button, EmptyState, Badge } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { StudentFilterFields } from "@/components/student-filter-fields";
import { subscriptionTotals, countUsedClasses, attendanceForSubscription, renewalUrgency } from "@/lib/subscription";
import { format } from "date-fns";

const URGENCY_COLORS: Record<string, string> = { ok: "green", soon: "yellow", due: "red" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; courseId?: string; renewal?: string; sort?: string }>;
}) {
  const { q, status, courseId, renewal, sort } = await searchParams;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [studentsRaw, courses] = await Promise.all([
    prisma.student.findMany({
      where: {
        status: status || undefined,
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { phone: { contains: q } },
                { email: { contains: q } },
                { studentCode: { contains: q } },
              ],
            }
          : {}),
        ...(courseId ? { enrollments: { some: { batch: { courseId } } } } : {}),
      },
      include: {
        enrollments: { include: { batch: { include: { course: true } } } },
        subscriptions: { where: { status: "ACTIVE" }, include: { course: true, bonusGrants: true } },
        attendance: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.course.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Resolve each active subscription's live remaining-classes/urgency/expiry
  // once per student, so filtering, sorting and the row display all agree.
  const students = studentsRaw.map((s) => {
    const subs = s.subscriptions.map((sub) => {
      const courseAttendance = s.attendance.filter((a) => a.courseId === sub.courseId);
      const used = countUsedClasses(attendanceForSubscription(sub.startDate, courseAttendance));
      const totals = subscriptionTotals(sub, used);
      return {
        courseName: sub.course.name,
        endDate: sub.endDate,
        totalClasses: totals.totalClasses,
        used: totals.used,
        remaining: totals.remaining,
        urgency: renewalUrgency(totals.remaining),
        inThisMonth: !!sub.endDate && sub.endDate >= monthStart && sub.endDate < monthEnd,
      };
    });
    return { ...s, subs };
  });

  function matchesRenewalFilter(sub: (typeof students)[number]["subs"][number]) {
    if (renewal === "this-month") return sub.inThisMonth;
    if (renewal === "soon") return sub.urgency === "soon";
    if (renewal === "due") return sub.urgency === "due";
    return true;
  }

  let filtered = renewal
    ? students.filter((s) => s.subs.some(matchesRenewalFilter))
    : students;

  // When a renewal filter is on, only show the subscriptions that actually
  // matched it — otherwise a student with one overdue and one healthy
  // subscription would bury the reason they're in the list.
  const relevantSubs = (s: (typeof students)[number]) => (renewal ? s.subs.filter(matchesRenewalFilter) : s.subs);

  if (sort === "joined") {
    filtered = [...filtered].sort((a, b) => b.joinDate.getTime() - a.joinDate.getTime());
  } else if (sort === "renewal") {
    filtered = [...filtered].sort((a, b) => {
      const aDate = Math.min(...relevantSubs(a).map((sub) => sub.endDate?.getTime() ?? Infinity), Infinity);
      const bDate = Math.min(...relevantSubs(b).map((sub) => sub.endDate?.getTime() ?? Infinity), Infinity);
      return aDate - bDate;
    });
  } else if (sort === "remaining") {
    filtered = [...filtered].sort((a, b) => {
      const aMin = Math.min(...relevantSubs(a).map((sub) => sub.remaining), Infinity);
      const bMin = Math.min(...relevantSubs(b).map((sub) => sub.remaining), Infinity);
      return aMin - bMin;
    });
  }

  const courseOptions = courses.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="All enrolled students at the academy"
        action={<SearchBox placeholder="Search by name, ID, phone..." defaultValue={q} extraParams={{ status, courseId, renewal, sort }} />}
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
                    selectedStatus={status}
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
