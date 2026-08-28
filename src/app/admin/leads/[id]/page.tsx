import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addFollowUp, changeLeadStatus, convertLeadToStudent, deleteLead, updateLead } from "@/lib/actions/lead-actions";
import { Card, CardBody, CardHeader, PageHeader, Badge, Input, Select, Textarea, Button } from "@/components/ui";
import { CloseDetailsButton } from "@/components/close-details-button";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  NEW: "blue",
  CONTACTED: "yellow",
  TRIAL_SCHEDULED: "purple",
  CONVERTED: "green",
  LOST: "red",
};

const summaryButtonClass =
  "inline-flex w-full items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer list-none";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [lead, courses] = await Promise.all([
    prisma.lead.findUnique({
      where: { id },
      include: {
        interestedCourse: true,
        followUps: { orderBy: { followUpDate: "desc" } },
        student: true,
      },
    }),
    prisma.course.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!lead) notFound();

  const isConverted = lead.status === "CONVERTED";

  return (
    <div>
      <PageHeader
        title={lead.name}
        subtitle={`${lead.phone}${lead.email ? " · " + lead.email : ""}`}
        action={<Badge color={statusColors[lead.status]}>{lead.status.replace("_", " ")}</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Enquiry details" />
            <CardBody>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <p className="text-slate-500">Source</p>
                  <p className="text-slate-900 font-medium">{lead.source.replace("_", " ")}</p>
                </div>
                <div>
                  <p className="text-slate-500">Interested course</p>
                  <p className="text-slate-900 font-medium">{lead.interestedCourse?.name ?? "Not specified"}</p>
                </div>
                <div>
                  <p className="text-slate-500">Logged on</p>
                  <p className="text-slate-900 font-medium">{format(lead.createdAt, "d MMM yyyy")}</p>
                </div>
                <div>
                  <p className="text-slate-500">Assigned to</p>
                  <p className="text-slate-900 font-medium">Front office</p>
                </div>
                {lead.notes && (
                  <div className="col-span-2">
                    <p className="text-slate-500">Notes</p>
                    <p className="text-slate-900">{lead.notes}</p>
                  </div>
                )}
              </div>

              <details>
                <summary className="text-sm text-indigo-600 hover:underline cursor-pointer list-none">Edit details</summary>
                <form action={updateLead.bind(null, lead.id)} className="mt-3 space-y-3 max-w-md">
                  <Input label="Name" name="name" defaultValue={lead.name} required />
                  <Input label="Phone" name="phone" defaultValue={lead.phone} required />
                  <Input label="Email" name="email" type="email" defaultValue={lead.email ?? ""} />
                  <Select label="Source" name="source" defaultValue={lead.source}>
                    <option value="CALL">Phone call</option>
                    <option value="WALK_IN">Walk-in</option>
                    <option value="REFERRAL">Referral</option>
                    <option value="ONLINE">Online</option>
                    <option value="OTHER">Other</option>
                  </Select>
                  <Select label="Interested course" name="interestedCourseId" defaultValue={lead.interestedCourseId ?? ""}>
                    <option value="">Not specified</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                  <Textarea label="Notes" name="notes" defaultValue={lead.notes ?? ""} />
                  <div className="flex gap-2">
                    <Button type="submit">Save changes</Button>
                    <CloseDetailsButton />
                  </div>
                </form>
              </details>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Follow-ups" subtitle="Log every call, visit or message" />
            <CardBody>
              <form action={addFollowUp.bind(null, lead.id)} className="space-y-3 mb-5 pb-5 border-b border-slate-100">
                <Textarea label="Follow-up note" name="note" placeholder="What was discussed?" required />
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input label="Next follow-up date" name="followUpDate" type="date" />
                  </div>
                  <Button type="submit">Add follow-up</Button>
                </div>
              </form>

              {lead.followUps.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No follow-ups logged yet</p>
              ) : (
                <ul className="space-y-4">
                  {lead.followUps.map((f) => (
                    <li key={f.id} className="text-sm">
                      <p className="text-slate-900">{f.note}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Next follow-up: {format(f.followUpDate, "d MMM yyyy")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Update status" />
            <CardBody>
              <form action={changeLeadStatus.bind(null, lead.id)} className="space-y-3">
                <Select name="status" defaultValue={lead.status}>
                  <option value="NEW">New</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="TRIAL_SCHEDULED">Trial scheduled</option>
                  <option value="CONVERTED">Converted</option>
                  <option value="LOST">Lost</option>
                </Select>
                <Button type="submit" variant="secondary" className="w-full">Save status</Button>
              </form>
            </CardBody>
          </Card>

          {isConverted && lead.student ? (
            <Card>
              <CardHeader title="Converted" />
              <CardBody>
                <p className="text-sm text-slate-600 mb-1">This lead has been converted to a student.</p>
                <p className="text-xs text-slate-400 mb-3">{lead.student.studentCode}</p>
                <a href={`/admin/students/${lead.student.id}`} className="text-sm text-indigo-600 hover:underline font-medium">
                  View student profile &rarr;
                </a>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Convert to student" subtitle="After counselling, if they're joining" />
              <CardBody>
                <details>
                  <summary className={summaryButtonClass}>Convert to student</summary>
                  <form action={convertLeadToStudent.bind(null, lead.id)} className="mt-3 space-y-3">
                    <Input label="Student name" name="name" defaultValue={lead.name} required />
                    <Input label="Phone" name="phone" defaultValue={lead.phone} required />
                    <Input label="Email" name="email" type="email" defaultValue={lead.email ?? ""} />
                    <Select label="Instrument / course" name="interestedCourseId" defaultValue={lead.interestedCourseId ?? ""}>
                      <option value="">Not specified</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                    <Input label="Date of birth" name="dob" type="date" />
                    <Select label="Gender" name="gender" defaultValue="">
                      <option value="">Not specified</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </Select>
                    <Textarea label="Address" name="address" />
                    <p className="text-xs text-slate-400">Review the details above — this creates the student record with a unique student ID.</p>
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1">Confirm &amp; convert</Button>
                      <CloseDetailsButton />
                    </div>
                  </form>
                </details>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody>
              <form action={deleteLead.bind(null, lead.id)}>
                <Button type="submit" variant="danger" className="w-full">Delete lead</Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
