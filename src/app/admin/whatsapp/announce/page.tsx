import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/attendance";
import { sendAnnouncement } from "@/lib/actions/whatsapp-actions";
import { announcementAudience } from "@/lib/whatsapp-service";
import { parseScope } from "@/lib/announcement";
import { DAY_LABELS, OPERATING_DAYS } from "@/lib/schedule";
import { TEMPLATE_BODIES, TEMPLATE_NOTICE, clockLabel, renderTemplate, shortDateLabel } from "@/lib/whatsapp-notices";
import { Card, CardBody, CardHeader, PageHeader, Select, Textarea, Button, EmptyState } from "@/components/ui";
import { CompRecipientPicker } from "@/components/comp-recipient-picker";

type Params = {
  audience?: string;
  courseId?: string | string[];
  batchId?: string | string[];
  message?: string;
  preview?: string;
};

const ids = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function AnnouncementPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const audienceKind = sp.audience === "courses" || sp.audience === "batches" ? sp.audience : "all";
  const pickedCourses = ids(sp.courseId);
  const pickedBatches = ids(sp.batchId);
  const message = sp.message ?? "";

  const [courses, batches] = await Promise.all([
    prisma.course.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.batch.findMany({
      include: { course: true, teacher: true, _count: { select: { enrollments: { where: { status: "ACTIVE", student: { status: "ACTIVE" } } } } } },
    }),
  ]);
  const batchesByCourse = courses
    .map((c) => ({
      course: c,
      list: batches
        .filter((b) => b.courseId === c.id)
        .sort((a, b) => OPERATING_DAYS.indexOf(a.dayOfWeek) - OPERATING_DAYS.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime)),
    }))
    .filter((g) => g.list.length > 0);

  const ready = message.trim().length > 0;
  const scope = parseScope({ audience: audienceKind, courseId: pickedCourses, batchId: pickedBatches });
  const audience = sp.preview && ready ? await announcementAudience(scope) : null;
  const first = audience?.families[0];

  return (
    <div>
      <PageHeader
        title="Announcement"
        subtitle="One WhatsApp message to each family number — everyone, an instrument, or classes on any day (a festival, a new batch, a reminder)"
        action={
          <div className="flex items-center gap-4">
            <Link href="/admin/whatsapp/new" className="text-sm text-indigo-600 hover:underline">
              Notice for one day&apos;s classes
            </Link>
            <Link href="/admin/whatsapp" className="text-sm text-indigo-600 hover:underline">
              Back to WhatsApp
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="h-fit">
          <CardHeader title="1. Who and what" />
          <CardBody>
            <form method="get" className="space-y-3">
              <input type="hidden" name="preview" value="1" />
              <Select label="Who gets it" name="audience" defaultValue={audienceKind}>
                <option value="all">All active students</option>
                <option value="courses">Students of chosen instruments (tick below)</option>
                <option value="batches">Students of chosen classes, any day (tick below)</option>
              </Select>

              <fieldset>
                <legend className="block text-sm font-medium text-ink mb-1">Instruments (when &lsquo;chosen instruments&rsquo; is selected)</legend>
                <div className="rounded-md border border-line divide-y divide-slate-100">
                  {courses.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <input type="checkbox" name="courseId" value={c.id} defaultChecked={pickedCourses.includes(c.id)} />
                      {c.name}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="block text-sm font-medium text-ink mb-1">Classes (when &lsquo;chosen classes&rsquo; is selected)</legend>
                <div className="max-h-72 overflow-y-auto rounded-md border border-line">
                  {batchesByCourse.map(({ course, list }) => (
                    <div key={course.id} className="border-b border-slate-100 last:border-0">
                      <p className="bg-panel px-3 py-1.5 text-xs font-medium text-slate-600">{course.name}</p>
                      {list.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <input type="checkbox" name="batchId" value={b.id} defaultChecked={pickedBatches.includes(b.id)} />
                          <span>
                            {DAY_LABELS[b.dayOfWeek]} {clockLabel(b.startTime)}
                            <span className="text-slate-500">
                              {" "}
                              · {b.teacher?.name ?? "No teacher"} · {b._count.enrollments} student{b._count.enrollments === 1 ? "" : "s"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </fieldset>

              <Textarea label="Message to families" name="message" defaultValue={message} rows={4} />
              <p className="text-xs text-slate-500">
                Goes out in the approved class notice wording: &ldquo;An update from The Musiq Academy about [student]&apos;s [instrument] class on [date]: your message&rdquo;. Each number is messaged once, written about the child whose next class is soonest.
              </p>
              <Button type="submit" variant="secondary" className="w-full">
                Preview who gets it
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card className="h-fit">
          <CardHeader title="2. Check and send" />
          <CardBody>
            {!sp.preview ? (
              <EmptyState text="Fill in the form and press Preview" />
            ) : !ready ? (
              <EmptyState text="Write the message" />
            ) : !audience || audience.families.length === 0 ? (
              <EmptyState
                text={
                  scope.kind === "courses" && pickedCourses.length === 0
                    ? "Tick at least one instrument"
                    : scope.kind === "batches" && pickedBatches.length === 0
                      ? "Tick at least one class"
                      : "Nobody in that audience has agreed to WhatsApp messages"
                }
              />
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-700">
                  <strong>{audience.families.length}</strong> message{audience.families.length === 1 ? "" : "s"}, one to each family number. Untick anyone who shouldn&apos;t get it.
                </p>
                {first && (
                  <div className="rounded-md bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-900">
                    {renderTemplate(TEMPLATE_BODIES[TEMPLATE_NOTICE], [first.studentName, first.courseName, shortDateLabel(parseDateOnly(first.classDate)), message.trim()])}
                  </div>
                )}
                {(audience.notAgreed.length > 0 || audience.noNumber > 0) && (
                  <p className="text-xs text-amber-700">
                    {audience.notAgreed.length > 0 && `${audience.notAgreed.length} number${audience.notAgreed.length === 1 ? "" : "s"} in this audience haven't agreed to WhatsApp messages and will be skipped. `}
                    {audience.noNumber > 0 && `${audience.noNumber} student${audience.noNumber === 1 ? " has" : "s have"} no phone number.`}
                  </p>
                )}
                <CompRecipientPicker
                  key={`${audienceKind}-${pickedCourses.join(",")}-${pickedBatches.join(",")}-${message}`}
                  action={sendAnnouncement}
                  nouns={["family", "families"]}
                  hidden={[
                    { name: "audience", value: audienceKind },
                    ...(scope.kind === "courses" ? scope.courseIds.map((id) => ({ name: "courseId", value: id })) : []),
                    ...(scope.kind === "batches" ? scope.batchIds.map((id) => ({ name: "batchId", value: id })) : []),
                    { name: "message", value: message.trim() },
                  ]}
                  rows={audience.families.map((f) => ({
                    id: f.phone,
                    studentName: f.students.join(", "),
                    detail: `Written about ${f.studentName} · ${f.courseName} class on ${shortDateLabel(parseDateOnly(f.classDate))}`,
                    phones: [{ phone: f.phone, consented: true }],
                  }))}
                />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
