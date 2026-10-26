import Link from "next/link";
import { parseDateOnly } from "@/lib/attendance";
import { sendNotice } from "@/lib/actions/whatsapp-actions";
import { batchesOnDate, recipientsForBatches } from "@/lib/whatsapp-service";
import {
  NOTICE_TYPES,
  NOTICE_TYPE_KEYS,
  TEMPLATE_BODIES,
  TEMPLATE_NOTICE,
  TEMPLATE_RESCHEDULED,
  clockLabel,
  isNoticeType,
  istDateString,
  renderTemplate,
  shortDateLabel,
} from "@/lib/whatsapp-notices";
import { Card, CardBody, CardHeader, PageHeader, Input, Select, Textarea, Button, Badge, EmptyState } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

type Params = {
  type?: string;
  date?: string;
  scope?: string;
  teacherId?: string;
  batchId?: string | string[];
  newDate?: string;
  newTime?: string;
  message?: string;
  preview?: string;
};

const RESCHEDULE_TIMES = Array.from({ length: 10 }, (_, i) => `${String(11 + i).padStart(2, "0")}:00`);

export default async function NewNoticePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const type = sp.type && isNoticeType(sp.type) ? sp.type : "TEACHER_LEAVE";
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : istDateString(new Date());
  const date = parseDateOnly(dateStr);
  const scope = sp.scope === "teacher" || sp.scope === "batches" ? sp.scope : "all";
  const newDateStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.newDate ?? "") ? sp.newDate! : "";
  const newTime = sp.newTime ?? "";
  const message = sp.message ?? (sp.preview ? "" : NOTICE_TYPES[type].defaultMessage);
  const pickedBatchIds = Array.isArray(sp.batchId) ? sp.batchId : sp.batchId ? [sp.batchId] : [];

  const dayBatches = await batchesOnDate(date);
  const teachers = Array.from(new Map(dayBatches.filter((b) => b.teacher).map((b) => [b.teacher!.id, b.teacher!.name])).entries());
  const teacherId = sp.teacherId && teachers.some(([id]) => id === sp.teacherId) ? sp.teacherId : (teachers[0]?.[0] ?? "");

  const selectedBatches =
    scope === "all"
      ? dayBatches
      : scope === "teacher"
        ? dayBatches.filter((b) => b.teacherId === teacherId)
        : dayBatches.filter((b) => pickedBatchIds.includes(b.id));

  const isReschedule = type === "RESCHEDULE";
  const ready = selectedBatches.length > 0 && (isReschedule ? !!newDateStr && !!newTime : message.trim().length > 0);
  const recipients = sp.preview && ready ? await recipientsForBatches(selectedBatches.map((b) => b.id)) : null;

  const willReceive = recipients ? recipients.reduce((n, r) => n + r.phones.filter((p) => p.consented).length, 0) : 0;

  const sampleParams = (r: { studentName: string; courseName: string; startTime: string }) =>
    isReschedule
      ? [r.studentName, r.courseName, `${shortDateLabel(date)}, ${clockLabel(r.startTime)}`, newDateStr && newTime ? `${shortDateLabel(parseDateOnly(newDateStr))}, ${clockLabel(newTime)}` : ""]
      : [r.studentName, r.courseName, shortDateLabel(date), message];
  const sampleBody = TEMPLATE_BODIES[isReschedule ? TEMPLATE_RESCHEDULED : TEMPLATE_NOTICE];

  return (
    <div>
      <PageHeader
        title="New notice"
        subtitle="Message the families of some classes on WhatsApp — a teacher on leave, running late, a rescheduled batch"
        action={
          <Link href="/admin/whatsapp" className="text-sm text-indigo-600 hover:underline">
            Back to WhatsApp
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="h-fit">
          <CardHeader title="1. What happened" />
          <CardBody>
            <form method="get" className="space-y-3">
              <input type="hidden" name="preview" value="1" />
              <Select label="Type" name="type" defaultValue={type}>
                {NOTICE_TYPE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {NOTICE_TYPES[k].label}
                  </option>
                ))}
              </Select>
              <Input label="Class date" name="date" type="date" defaultValue={dateStr} required />

              <Select label="Which classes" name="scope" defaultValue={scope}>
                <option value="all">All classes that day</option>
                <option value="teacher">All classes of one teacher</option>
                <option value="batches">Specific classes (tick below)</option>
              </Select>
              {teachers.length > 0 && (
                <Select label="Teacher (when 'one teacher' is chosen)" name="teacherId" defaultValue={teacherId}>
                  {teachers.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Select>
              )}
              <fieldset>
                <legend className="block text-sm font-medium text-ink mb-1">Classes that day (when &lsquo;specific classes&rsquo; is chosen)</legend>
                {dayBatches.length === 0 ? (
                  <p className="text-xs text-slate-500">No classes are scheduled on {shortDateLabel(date)}.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto rounded-md border border-line divide-y divide-slate-100">
                    {dayBatches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <input type="checkbox" name="batchId" value={b.id} defaultChecked={pickedBatchIds.includes(b.id)} />
                        <span>
                          {clockLabel(b.startTime)} · {b.course.name}
                          <span className="text-slate-500"> · {b.teacher?.name ?? "No teacher"}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              {isReschedule ? (
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Moved to (date)" name="newDate" type="date" defaultValue={newDateStr} required />
                  <Select label="New start time" name="newTime" defaultValue={newTime}>
                    <option value="">Choose…</option>
                    {RESCHEDULE_TIMES.map((t) => (
                      <option key={t} value={t}>
                        {clockLabel(t)}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <Textarea label="Message to families" name="message" defaultValue={message} rows={4} />
              )}
              <p className="text-xs text-slate-500">Change the type? Press Preview again to refresh the suggested wording.</p>
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
              <EmptyState
                text={
                  selectedBatches.length === 0
                    ? "No classes selected for that date"
                    : isReschedule
                      ? "Choose the new date and time"
                      : "Write the message"
                }
              />
            ) : recipients && recipients.length === 0 ? (
              <EmptyState text="Nobody is enrolled in those classes" />
            ) : recipients ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-700">
                  <strong>{willReceive}</strong> message{willReceive === 1 ? "" : "s"} will be sent for {recipients.length} student
                  {recipients.length === 1 ? "" : "s"} in {selectedBatches.length} class{selectedBatches.length === 1 ? "" : "es"}.
                </p>

                <div className="rounded-md bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-900">
                  {renderTemplate(sampleBody, sampleParams(recipients[0]))}
                </div>

                <ul className="divide-y divide-slate-100 rounded-md border border-line max-h-80 overflow-y-auto">
                  {recipients.map((r) => (
                    <li key={`${r.studentId}-${r.batchId}`} className="px-3 py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-900">{r.studentName}</p>
                        <p className="text-xs text-slate-500">
                          {r.courseName} · {clockLabel(r.startTime)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {r.phones.length === 0 ? (
                          <Badge color="red">No phone number</Badge>
                        ) : (
                          r.phones.map((p) => (
                            <Badge key={p.phone} color={p.consented ? "green" : "yellow"}>
                              {p.phone} · {p.consented ? "will receive" : "hasn't agreed"}
                            </Badge>
                          ))
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {willReceive === 0 ? (
                  <p className="text-sm text-amber-700">
                    Nobody here has agreed to WhatsApp messages yet, so nothing would be sent. Families agree by messaging 70901 20000, or you can record it on the student&apos;s page.
                  </p>
                ) : (
                  <form action={sendNotice}>
                    <input type="hidden" name="type" value={type} />
                    <input type="hidden" name="date" value={dateStr} />
                    {selectedBatches.map((b) => (
                      <input key={b.id} type="hidden" name="batchId" value={b.id} />
                    ))}
                    <input type="hidden" name="message" value={message} />
                    <input type="hidden" name="newDate" value={newDateStr} />
                    <input type="hidden" name="newTime" value={newTime} />
                    <ConfirmSubmitButton
                      variant="primary"
                      className="w-full"
                      confirmMessage={`Send ${willReceive} WhatsApp message${willReceive === 1 ? "" : "s"} now? This can't be undone.`}
                    >
                      Send {willReceive} message{willReceive === 1 ? "" : "s"} on WhatsApp
                    </ConfirmSubmitButton>
                  </form>
                )}
                {NOTICE_TYPES[type].suppressesReminder && (
                  <p className="text-xs text-slate-500">
                    Once sent, the 10:00 AM reminder for these classes on {shortDateLabel(date)} is skipped, so families don&apos;t get a &ldquo;class today&rdquo; message as well.
                  </p>
                )}
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
