import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, PageHeader, Input, Select, Button, EmptyState, Badge } from "@/components/ui";
import { DownloadCsvLink } from "@/components/download-csv-link";
import { getLeadReportRows } from "@/lib/reports/leads";
import { format } from "date-fns";

const PREVIEW_LIMIT = 100;

const statusColors: Record<string, string> = {
  NEW: "blue",
  CONTACTED: "yellow",
  TRIAL_SCHEDULED: "purple",
  TRIAL_COMPLETED: "purple",
  CONVERTED: "green",
  LOST: "red",
};

export default async function LeadsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string; courseId?: string; dateFrom?: string; dateTo?: string; q?: string }>;
}) {
  const filters = await searchParams;
  const { status, source, courseId, dateFrom, dateTo, q } = filters;

  const [rows, courses] = await Promise.all([
    getLeadReportRows(filters),
    prisma.course.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Leads report" subtitle="Filter, preview, then download the full result as CSV" />

      <Card className="mb-6">
        <CardHeader title="Filters" />
        <CardBody>
          <form method="get" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
            <Input label="Search (name, phone, email)" name="q" defaultValue={q} placeholder="e.g. Karthik" />
            <Select label="Status" name="status" defaultValue={status ?? ""}>
              <option value="">All statuses</option>
              <option value="NEW">New</option>
              <option value="CONTACTED">Contacted</option>
              <option value="TRIAL_SCHEDULED">Trial scheduled</option>
              <option value="TRIAL_COMPLETED">Trial completed</option>
              <option value="CONVERTED">Converted</option>
              <option value="LOST">Lost</option>
            </Select>
            <Select label="Source" name="source" defaultValue={source ?? ""}>
              <option value="">All sources</option>
              <option value="CALL">Phone call</option>
              <option value="WALK_IN">Walk-in</option>
              <option value="REFERRAL">Referral</option>
              <option value="ONLINE">Online</option>
              <option value="OTHER">Other</option>
            </Select>
            <Select label="Interested instrument" name="courseId" defaultValue={courseId ?? ""}>
              <option value="">All instruments</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input label="Created from" name="dateFrom" type="date" defaultValue={dateFrom} />
            <Input label="Created to" name="dateTo" type="date" defaultValue={dateTo} />
            <Button type="submit">Apply filters</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`${rows.length} lead${rows.length !== 1 ? "s" : ""} match`}
          action={<DownloadCsvLink href="/admin/reports/leads/export" params={{ status, source, courseId, dateFrom, dateTo, q }} />}
        />
        {rows.length === 0 ? (
          <CardBody>
            <EmptyState text="No leads match these filters" />
          </CardBody>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {rows.slice(0, PREVIEW_LIMIT).map((l) => (
                <li key={l.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="text-slate-900 font-medium">{l.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {l.phone} · {l.source.replace("_", " ")} · {l.interestedCourse?.name ?? "No instrument"} · {format(l.createdAt, "d MMM yyyy")}
                    </p>
                  </div>
                  <Badge color={statusColors[l.status]}>{l.status.replace("_", " ")}</Badge>
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
