import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, PageHeader, Input, Select, Button, EmptyState, Badge } from "@/components/ui";
import { DownloadCsvLink } from "@/components/download-csv-link";
import { getAttendanceReportRows } from "@/lib/reports/attendance";
import { format } from "date-fns";

const PREVIEW_LIMIT = 150;

export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; status?: string; dateFrom?: string; dateTo?: string; q?: string }>;
}) {
  const filters = await searchParams;
  const { courseId, status, dateFrom, dateTo, q } = filters;

  const [rows, courses] = await Promise.all([
    getAttendanceReportRows(filters),
    prisma.course.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Attendance report" subtitle="Filter, preview, then download the full result as CSV" />

      <Card className="mb-6">
        <CardHeader title="Filters" />
        <CardBody>
          <form method="get" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
            <Input label="Search student (name, ID)" name="q" defaultValue={q} placeholder="e.g. Arjun" />
            <Select label="Instrument" name="courseId" defaultValue={courseId ?? ""}>
              <option value="">All instruments</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select label="Status" name="status" defaultValue={status ?? ""}>
              <option value="">All</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
            </Select>
            <Input label="Date from" name="dateFrom" type="date" defaultValue={dateFrom} />
            <Input label="Date to" name="dateTo" type="date" defaultValue={dateTo} />
            <Button type="submit">Apply filters</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`${rows.length} record${rows.length !== 1 ? "s" : ""} match`}
          action={<DownloadCsvLink href="/admin/reports/attendance/export" params={{ courseId, status, dateFrom, dateTo, q }} />}
        />
        {rows.length === 0 ? (
          <CardBody>
            <EmptyState text="No attendance records match these filters" />
          </CardBody>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {rows.slice(0, PREVIEW_LIMIT).map((a) => (
                <li key={a.id} className="px-5 py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <span className="text-slate-900">{a.student.name}</span>
                    <span className="text-slate-400"> · {a.course.name} · {format(a.date, "d MMM yyyy")}</span>
                  </div>
                  <Badge color={a.status === "PRESENT" ? "green" : "red"}>{a.status}</Badge>
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
