import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, PageHeader, Input, Select, Button, EmptyState } from "@/components/ui";
import { DownloadCsvLink } from "@/components/download-csv-link";
import { getStudentReportRows } from "@/lib/reports/students";
import { format } from "date-fns";

const PREVIEW_LIMIT = 100;

export default async function StudentsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; courseId?: string; gender?: string; joinedFrom?: string; joinedTo?: string; q?: string }>;
}) {
  const filters = await searchParams;
  const { status, courseId, gender, joinedFrom, joinedTo, q } = filters;

  const [rows, courses] = await Promise.all([
    getStudentReportRows(filters),
    prisma.course.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Students report" subtitle="Filter, preview, then download the full result as CSV" />

      <Card className="mb-6">
        <CardHeader title="Filters" />
        <CardBody>
          <form method="get" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
            <Input label="Search (name, phone, email, ID)" name="q" defaultValue={q} placeholder="e.g. Arjun" />
            <Select label="Status" name="status" defaultValue={status ?? ""}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
            <Select label="Instrument" name="courseId" defaultValue={courseId ?? ""}>
              <option value="">All instruments</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select label="Gender" name="gender" defaultValue={gender ?? ""}>
              <option value="">All</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </Select>
            <Input label="Joined from" name="joinedFrom" type="date" defaultValue={joinedFrom} />
            <Input label="Joined to" name="joinedTo" type="date" defaultValue={joinedTo} />
            <Button type="submit">Apply filters</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`${rows.length} student${rows.length !== 1 ? "s" : ""} match`}
          action={<DownloadCsvLink href="/admin/reports/students/export" params={{ status, courseId, gender, joinedFrom, joinedTo, q }} />}
        />
        {rows.length === 0 ? (
          <CardBody>
            <EmptyState text="No students match these filters" />
          </CardBody>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {rows.slice(0, PREVIEW_LIMIT).map((s) => (
                <li key={s.id} className="px-5 py-3 text-sm">
                  <p className="text-slate-900 font-medium">
                    {s.name} <span className="text-xs font-normal text-slate-400">{s.studentCode}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {s.status} · {s.gender ?? "—"} · Joined {format(s.joinDate, "d MMM yyyy")} ·{" "}
                    {Array.from(new Set(s.enrollments.map((e) => e.batch.course.name))).join(", ") || "No instrument"}
                  </p>
                </li>
              ))}
            </ul>
            {rows.length > PREVIEW_LIMIT && (
              <CardBody className="border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  Showing the first {PREVIEW_LIMIT} of {rows.length} — download the CSV for the complete list.
                </p>
              </CardBody>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
