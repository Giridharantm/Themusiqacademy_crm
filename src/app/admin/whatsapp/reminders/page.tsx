import Link from "next/link";
import { parseDateOnly } from "@/lib/attendance";
import { setRemindersPausedAction, setStudentRemindersOff, toggleReminderSkip } from "@/lib/actions/whatsapp-actions";
import { getRemindersPaused, planReminders } from "@/lib/whatsapp-service";
import {
  DECISION_LABELS,
  TEMPLATE_BODIES,
  clockLabel,
  istDateString,
  istLabel,
  nextReminderDateStr,
  reminderMessage,
  renderTemplate,
  shortDateLabel,
  type ReminderDecision,
} from "@/lib/whatsapp-notices";
import { Card, CardBody, CardHeader, PageHeader, Badge, Button, EmptyState } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const decisionColor: Record<ReminderDecision, string> = {
  SEND: "green",
  CLASS_NOTICE: "slate",
  STUDENT_OFF: "red",
  SKIPPED: "yellow",
  NO_PHONE: "red",
  NO_CONSENT: "yellow",
};

const addDays = (dateStr: string, n: number) => new Date(parseDateOnly(dateStr).getTime() + n * 86_400_000 + 12 * 3_600_000).toISOString().slice(0, 10);

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const today = istDateString(now);
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : nextReminderDateStr(now);
  const date = parseDateOnly(dateStr);
  const isPast = dateStr < today;

  const [plan, pause] = await Promise.all([planReminders(dateStr), getRemindersPaused()]);

  const counts = plan.rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.decision]: (acc[r.decision] ?? 0) + 1 }), {});
  const first = plan.rows.find((r) => r.decision === "SEND");
  const sample = first ? renderTemplate(TEMPLATE_BODIES[reminderMessage(first, first.progress).template], reminderMessage(first, first.progress).params) : null;

  return (
    <div>
      <PageHeader
        title="Class reminders"
        subtitle="Who gets the 10:00 AM WhatsApp reminder for a day's classes — and the controls to pause it or take someone off"
        action={
          <Link href="/admin/whatsapp" className="text-sm text-indigo-600 hover:underline">
            Back to WhatsApp
          </Link>
        }
      />

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Daily reminders are{" "}
              <span className={pause.paused ? "text-red-600" : "text-emerald-700"}>{pause.paused ? "PAUSED" : "ON"}</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {pause.paused
                ? `Nothing is sent at 10:00 AM until you resume${pause.changedBy ? ` (paused by ${pause.changedBy}${pause.changedAt ? ", " + istLabel(pause.changedAt) : ""})` : ""}. Notices and inbox replies still work.`
                : "Sent every class day at 10:00 AM to the families below who have agreed. Monday is a holiday."}
            </p>
          </div>
          <form action={setRemindersPausedAction.bind(null, !pause.paused)}>
            <ConfirmSubmitButton
              variant={pause.paused ? "primary" : "secondary"}
              confirmMessage={pause.paused ? "Resume the daily 10:00 AM reminders?" : "Pause ALL daily reminders? Nothing will be sent at 10:00 AM until you resume."}
            >
              {pause.paused ? "Resume reminders" : "Pause reminders"}
            </ConfirmSubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`${shortDateLabel(date)}${dateStr === today ? " (today)" : ""}`}
          subtitle={
            !plan.isClassDay
              ? "No classes — Monday is a holiday"
              : `${plan.classes} class${plan.classes === 1 ? "" : "es"} · ${counts.SEND ?? 0} reminder${(counts.SEND ?? 0) === 1 ? "" : "s"} will go out${
                  pause.paused ? " — but reminders are paused" : ""
                }`
          }
          action={
            <div className="flex items-center gap-3 text-sm">
              <Link href={{ pathname: "/admin/whatsapp/reminders", query: { date: addDays(dateStr, -1) } }} className="text-indigo-600 hover:underline">
                ← Previous day
              </Link>
              <Link href={{ pathname: "/admin/whatsapp/reminders", query: { date: addDays(dateStr, 1) } }} className="text-indigo-600 hover:underline">
                Next day →
              </Link>
            </div>
          }
        />

        {plan.isClassDay && plan.rows.length > 0 && (
          <CardBody className="border-b border-slate-100 space-y-3">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(DECISION_LABELS) as ReminderDecision[])
                .filter((d) => counts[d])
                .map((d) => (
                  <Badge key={d} color={decisionColor[d]}>
                    {counts[d]} · {DECISION_LABELS[d]}
                  </Badge>
                ))}
            </div>
            {sample && (
              <div className="rounded-md bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-900">
                <p className="text-xs text-emerald-700 mb-1">Example of what a family receives:</p>
                {sample}
              </div>
            )}
          </CardBody>
        )}

        {!plan.isClassDay ? (
          <CardBody>
            <EmptyState text="No classes on this day" />
          </CardBody>
        ) : plan.rows.length === 0 ? (
          <CardBody>
            <EmptyState text="Nobody is enrolled in a class on this day" />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {plan.rows.map((r) => (
              <li key={r.key} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900">
                    <Link href={`/admin/students/${r.studentId}`} className="font-medium hover:text-indigo-600">
                      {r.studentName}
                    </Link>
                    <span className="text-slate-500">
                      {" "}
                      · {r.courseName} · {clockLabel(r.startTime)}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.phone ?? "No phone number"}
                    {r.progress ? ` · ${r.progress.used} of ${r.progress.total} classes completed` : " · no current subscription"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {r.sentStatus ? (
                    <Badge color={r.sentStatus === "FAILED" ? "red" : r.sentStatus === "DRY_RUN" ? "blue" : "green"}>
                      {r.sentStatus === "FAILED" ? "Failed" : r.sentStatus === "PENDING" ? "Sending" : r.sentStatus === "DRY_RUN" ? "Test (not sent)" : "Sent"}
                    </Badge>
                  ) : (
                    <Badge color={decisionColor[r.decision]}>{DECISION_LABELS[r.decision]}</Badge>
                  )}
                  {r.sentStatus === "FAILED" && r.error && <span className="text-xs text-red-600 max-w-[16rem] break-words">{r.error}</span>}
                  {!isPast && !r.sentStatus && !r.remindersOff && r.decision !== "CLASS_NOTICE" && (
                    <form action={toggleReminderSkip.bind(null, r.studentId, dateStr)}>
                      <Button type="submit" variant="ghost">
                        {r.skipped ? "Undo skip" : "Skip this day"}
                      </Button>
                    </form>
                  )}
                  <form action={setStudentRemindersOff.bind(null, r.studentId, !r.remindersOff)}>
                    <Button type="submit" variant="ghost">
                      {r.remindersOff ? "Turn reminders back on" : "Turn off for this student"}
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
