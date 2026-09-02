import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createLead } from "@/lib/actions/lead-actions";
import { Card, CardBody, CardHeader, PageHeader, Badge, Input, Select, Textarea, Button, EmptyState } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { normalizeSearchQuery, phoneSearchDigits } from "@/lib/search";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  NEW: "blue",
  CONTACTED: "yellow",
  TRIAL_SCHEDULED: "purple",
  TRIAL_COMPLETED: "purple",
  CONVERTED: "green",
  LOST: "red",
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status, q: rawQ } = await searchParams;
  const q = normalizeSearchQuery(rawQ);
  const phoneDigits = q ? phoneSearchDigits(q) : undefined;

  const [leads, courses] = await Promise.all([
    prisma.lead.findMany({
      where: {
        // "open" isn't a real status — it's the dashboard's "not yet
        // converted or lost" count, spanning NEW/CONTACTED/TRIAL_SCHEDULED.
        status:
          status === "open"
            ? { notIn: ["CONVERTED", "LOST"] }
            : status
              ? (status as "NEW" | "CONTACTED" | "TRIAL_SCHEDULED" | "TRIAL_COMPLETED" | "CONVERTED" | "LOST")
              : undefined,
        OR: q
          ? [
              { name: { contains: q, mode: "insensitive" } },
              ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
              { email: { contains: q, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: { interestedCourse: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.course.findMany({ orderBy: { name: "asc" } }),
  ]);

  const statuses = ["NEW", "CONTACTED", "TRIAL_SCHEDULED", "TRIAL_COMPLETED", "CONVERTED", "LOST"];

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Track enquiries from calls, walk-ins and referrals"
        action={<SearchBox placeholder="Search leads..." defaultValue={q} extraParams={{ status }} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={{ pathname: "/admin/leads", query: q ? { q } : {} }} className={`text-xs px-3 py-1.5 rounded-full border ${!status ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`}>
              All
            </Link>
            <Link href={{ pathname: "/admin/leads", query: q ? { status: "open", q } : { status: "open" } }} className={`text-xs px-3 py-1.5 rounded-full border ${status === "open" ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`}>
              Open
            </Link>
            {statuses.map((s) => (
              <Link
                key={s}
                href={{ pathname: "/admin/leads", query: q ? { status: s, q } : { status: s } }}
                className={`text-xs px-3 py-1.5 rounded-full border ${status === s ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`}
              >
                {s.replace("_", " ")}
              </Link>
            ))}
          </div>

          <Card>
            {leads.length === 0 ? (
              <CardBody>
                <EmptyState text={q ? "No leads match your search" : "No leads found"} />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <li key={lead.id}>
                    <Link href={`/admin/leads/${lead.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{lead.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {lead.phone} · {lead.source.replace("_", " ")} · {lead.interestedCourse?.name ?? "No course selected"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{format(lead.createdAt, "d MMM yyyy")}</span>
                        <Badge color={statusColors[lead.status]}>{lead.status.replace("_", " ")}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="New enquiry" subtitle="Log a call or walk-in" />
          <CardBody>
            <form action={createLead} className="space-y-3">
              <Input label="Name" name="name" required />
              <Input label="Phone" name="phone" required />
              <Input label="Email" name="email" type="email" />
              <Select label="Source" name="source" defaultValue="CALL">
                <option value="CALL">Phone call</option>
                <option value="WALK_IN">Walk-in</option>
                <option value="REFERRAL">Referral</option>
                <option value="ONLINE">Online</option>
                <option value="OTHER">Other</option>
              </Select>
              <Select label="Interested course" name="interestedCourseId" defaultValue="">
                <option value="">Not specified</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Textarea label="Notes" name="notes" placeholder="Anything discussed..." />
              <Button type="submit" className="w-full">Save enquiry</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
