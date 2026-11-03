import Link from "next/link";
import { parseDateOnly } from "@/lib/attendance";
import { sendRemindersNowAction, setReminderButtonsAction, setReminderTimeAction, setRemindersPausedAction, setStudentRemindersOff, toggleReminderSkip } from "@/lib/actions/whatsapp-actions";
import { compClassesSent, getReminderButtons, getReminderSchedule, getRemindersPaused, planReminders } from "@/lib/whatsapp-service";
import { REPLY_STATUS_LABELS, replyCounts, type ReplyStatus } from "@/lib/class-confirm";
import {
  DECISION_LABELS,
  REMINDER_TIME_OPTIONS,
  TEMPLATE_BODIES,
  clockLabel,
  filterReminderRows,
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
import { AutoSubmitSelect } from "@/components/batch-filter-fields";

const replyColor: Record<ReplyStatus | "FAILED", string> = { CONFIRMED: "green", DECLINED: "red", CANCELLED: "slate", MOVED: "blue", NO_REPLY: "yellow", FAILED: "red" };

const decisionColor: Record<ReminderDecision, string> = {
  SEND: "green",
  CLASS_NOTICE: "slate",
  STUDENT_OFF: "red",
  SKIPPED: "yellow",
  NO_PHONE: "red",
  NO_CONSENT: "yellow",
};

const addDays = (dateStr: string, n: number) => new Date(parseDateOnly(dateStr).getTime() + n * 86_400_000 + 12 * 3_600_000).toISOString().slice(0, 10);

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; course?: string; time?: string; status?: string; reply?: string; q?: string; sentNow?: string; compOk?: string; compFailed?: string; failedNow?: string; alreadyNow?: string; notSent?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const today = istDateString(now);
  const schedule = await getReminderSchedule();
  const atLabel = clockLabel(schedule.time);
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : nextReminderDateStr(now, schedule.time);
  const date = parseDateOnly(dateStr);
  const isPast = dateStr < today;

  const [plan, pause, buttons, todayPlan, comps] = await Promise.all([planReminders(dateStr), getRemindersPaused(), getReminderButtons(), planReminders(today), compClassesSent(dateStr)]);
  // Today's reminders that haven't gone out yet (not sent, or a send that failed).
  const todayPending = todayPlan.rows.filter((r) => r.decision === "SEND" && r.sentStatus !== "SENT" && r.sentStatus !== "DRY_RUN").length;
  const todaySent = todayPlan.rows.filter((r) => r.sentStatus === "SENT").length;

  // Filters narrow the list below; the badges above still describe the whole day.
  const rows = filterReminderRows(plan.rows, { course: sp.course, time: sp.time, status: sp.status, reply: sp.reply, q: sp.q });
  const filtering = !!(sp.course || sp.time || sp.status || sp.reply || sp.q?.trim());
  const replies = replyCounts(plan.rows.map((r) => r.replyStatus));
  const replyOptions = (Object.keys(REPLY_STATUS_LABELS) as ReplyStatus[]).filter((s) => replies[s] > 0).map((s) => ({ value: s, label: REPLY_STATUS_LABELS[s] }));
  const courseOptions = Array.from(new Set(plan.rows.map((r) => r.courseName)))
    .sort()
    .map((c) => ({ value: c, label: c }));
  const timeOptions = Array.from(new Set(plan.rows.map((r) => r.startTime)))
    .sort()
    .map((t) => ({ value: t, label: clockLabel(t) }));
  const statusOptions = (Object.keys(DECISION_LABELS) as ReminderDecision[])
    .filter((d) => plan.rows.some((r) => r.decision === d))
    .map((d) => ({ value: d, label: DECISION_LABELS[d] }));
  // Previous/next day keep whatever filters are set.
  const dayLink = (d: string) => ({
    pathname: "/admin/whatsapp/reminders",
    query: { date: d, ...(sp.course ? { course: sp.course } : {}), ...(sp.time ? { time: sp.time } : {}), ...(sp.status ? { status: sp.status } : {}), ...(sp.reply ? { reply: sp.reply } : {}), ...(sp.q?.trim() ? { q: sp.q } : {}) },
  });

  const counts = plan.rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.decision]: (acc[r.decision] ?? 0) + 1 }), {});
  const first = plan.rows.find((r) => r.decision === "SEND");
  const sample = first ? renderTemplate(TEMPLATE_BODIES[reminderMessage(first, first.progress).template], reminderMessage(first, first.progress).params) : null;

  return (
    <div>
      <PageHeader
        title="Class reminders"
        subtitle={`Who gets the ${atLabel} WhatsApp reminder for a day's classes — and the controls to set the time, pause it, send it by hand or take someone off`}
        action={
          <Link href="/admin/whatsapp" className="text-sm text-indigo-600 hover:underline">
            Back to WhatsApp
          </Link>
        }
      />

      {sp.sentNow !== undefined && (
        <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          Sent {sp.sentNow} reminder{sp.sentNow === "1" ? "" : "s"}
          {Number(sp.alreadyNow) > 0 ? `, ${sp.alreadyNow} had already gone out` : ""}
          {Number(sp.failedNow) > 0 ? `, ${sp.failedNow} failed (see the list below)` : ""}.
        </p>
      )}
      {sp.compOk !== undefined && (
        <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          Comp class sent to {sp.compOk} number{sp.compOk === "1" ? "" : "s"}
          {Number(sp.compFailed) > 0 ? `, ${sp.compFailed} failed` : ""}. Answers appear below as families tap Yes or No.
        </p>
      )}
      {sp.notSent && <p className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">Nothing was sent: {sp.notSent}.</p>}

      <Card className="mb-6">
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-slate-900">Reminder time: {atLabel}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                The day&apos;s reminders go out automatically at this time. If the server was off or reminders were paused, they still go out for up to 2 hours after; later than that, use the button below.
              </p>
            </div>
            <form action={setReminderTimeAction} className="flex items-end gap-2">
              <label className="block">
                <span className="block text-xs text-slate-500 mb-1">Send at</span>
                <select key={schedule.time} name="time" defaultValue={schedule.time} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                  {REMINDER_TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {clockLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="secondary">
                Save time
              </Button>
            </form>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-slate-900">Send today&apos;s reminders now</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {!todayPlan.isClassDay
                  ? "No classes today (Monday holiday)."
                  : todayPending === 0
                    ? `Today's reminders have all gone out (${todaySent} sent).`
                    : `${todayPending} reminder${todayPending === 1 ? "" : "s"} for today haven't gone out yet${todaySent ? ` (${todaySent} already sent)` : ""}. Works even while reminders are paused; anyone already messaged is skipped.`}
                {schedule.lastRunAt ? ` Last run: ${istLabel(schedule.lastRunAt)}, ${schedule.lastRunSummary}.` : ""}
              </p>
            </div>
            {todayPlan.isClassDay && todayPending > 0 && (
              <form action={sendRemindersNowAction}>
                <ConfirmSubmitButton
                  variant="primary"
                  confirmMessage={`Send ${todayPending} WhatsApp reminder${todayPending === 1 ? "" : "s"} for today's classes now?${pause.paused ? " Reminders are paused, but this will still send." : ""} This can't be undone.`}
                >
                  Send today&apos;s reminders now
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Daily reminders are{" "}
              <span className={pause.paused ? "text-red-600" : "text-emerald-700"}>{pause.paused ? "PAUSED" : "ON"}</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {pause.paused
                ? `Nothing is sent automatically at ${atLabel} until you resume${pause.changedBy ? ` (paused by ${pause.changedBy}${pause.changedAt ? ", " + istLabel(pause.changedAt) : ""})` : ""}. Notices, inbox replies and "Send today's reminders now" still work.`
                : `Sent every class day at ${atLabel} to the families below who have agreed. Monday is a holiday.`}
            </p>
          </div>
          <form action={setRemindersPausedAction.bind(null, !pause.paused)}>
            <ConfirmSubmitButton
              variant={pause.paused ? "primary" : "secondary"}
              confirmMessage={pause.paused ? `Resume the daily ${atLabel} reminders?` : `Pause ALL daily reminders? Nothing will be sent automatically at ${atLabel} until you resume.`}
            >
              {pause.paused ? "Resume reminders" : "Pause reminders"}
            </ConfirmSubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-slate-900">
              Reminder buttons are{" "}
              <span className={buttons ? "text-emerald-700" : "text-slate-500"}>{buttons ? "ON" : "OFF"}</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {buttons
                ? "Each reminder asks “Will you be able to attend?” with “Yes, I'll attend” and “No, can't attend”. A No asks whether to reschedule or cancel the class: Reschedule sends a list of free make-up slots to pick from (same day, or within 5 working days for Drums, Keyboard and Guitar); Cancel records the skip."
                : "Reminders go without buttons. Turn this on only after Meta has approved the templates class_reminder_buttons and class_reminder_progress_buttons — until then those sends would fail."}
            </p>
          </div>
          <form action={setReminderButtonsAction.bind(null, !buttons)}>
            <ConfirmSubmitButton
              variant="secondary"
              confirmMessage={buttons ? "Send reminders without buttons again?" : "Turn buttons on? Both button templates must already be approved in WhatsApp Manager, or reminders will fail to send."}
            >
              {buttons ? "Turn buttons off" : "Turn buttons on"}
            </ConfirmSubmitButton>
          </form>
        </CardBody>
      </Card>

      {comps.map((c) => {
        const counts = replyCounts(c.rows.map((r) => (r.status === "FAILED" ? null : r.status)));
        return (
          <Card key={c.noticeId} className="mb-6">
            <CardHeader
              title={`Comp class · ${c.time ? clockLabel(c.time) : ""} · ${shortDateLabel(date)}`}
              subtitle={`${c.rows.length} student${c.rows.length === 1 ? "" : "s"} messaged · ${counts.CONFIRMED} confirmed · ${counts.DECLINED} can't come · ${counts.NO_REPLY} no reply yet${
                c.rows.some((r) => r.status === "FAILED") ? ` · ${c.rows.filter((r) => r.status === "FAILED").length} failed` : ""
              }`}
              action={<Link href={`/admin/whatsapp/new?type=COMP_CLASS`} className="text-sm text-indigo-600 hover:underline">New comp class</Link>}
            />
            <ul className="divide-y divide-slate-100">
              {c.rows.map((r) => (
                <li key={`${r.studentId}-${r.courseName}`} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-900 min-w-0">
                    <Link href={`/admin/students/${r.studentId}`} className="font-medium hover:text-indigo-600">
                      {r.studentName}
                    </Link>
                    <span className="text-slate-500">
                      {" "}
                      · {r.courseName} · {r.phones.join(", ")}
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    {r.answeredAt && <span className="text-xs text-slate-400">{istLabel(r.answeredAt)}</span>}
                    <Badge color={replyColor[r.status]}>{r.status === "FAILED" ? "Not delivered" : REPLY_STATUS_LABELS[r.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

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
              <Link href={dayLink(addDays(dateStr, -1))} className="text-indigo-600 hover:underline">
                ← Previous day
              </Link>
              <Link href={dayLink(addDays(dateStr, 1))} className="text-indigo-600 hover:underline">
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
              {(Object.keys(REPLY_STATUS_LABELS) as ReplyStatus[])
                .filter((s) => replies[s])
                .map((s) => (
                  <Badge key={s} color={replyColor[s]}>
                    {replies[s]} · {REPLY_STATUS_LABELS[s]}
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

        {plan.isClassDay && plan.rows.length > 0 && (
          <CardBody className="border-b border-slate-100">
            <form method="get" className="space-y-2">
              <input type="hidden" name="date" value={dateStr} />
              <div className="flex flex-wrap gap-2">
                <AutoSubmitSelect name="course" value={sp.course} options={courseOptions} placeholder="All instruments" />
                <AutoSubmitSelect name="time" value={sp.time} options={timeOptions} placeholder="All times" />
                <AutoSubmitSelect name="status" value={sp.status} options={statusOptions} placeholder="Any status" />
                {replyOptions.length > 0 && <AutoSubmitSelect name="reply" value={sp.reply} options={replyOptions} placeholder="Any reply" />}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  name="q"
                  defaultValue={sp.q}
                  placeholder="Search by student name or phone number…"
                  className="flex-1 min-w-[12rem] rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <Button type="submit" variant="secondary">
                  Search
                </Button>
                {filtering && (
                  <Link href={{ pathname: "/admin/whatsapp/reminders", query: { date: dateStr } }} className="text-sm text-indigo-600 hover:underline">
                    Clear filters
                  </Link>
                )}
                <span className="text-xs text-slate-500 ml-auto">
                  {filtering ? `Showing ${rows.length} of ${plan.rows.length}` : `${plan.rows.length} in total`}
                </span>
              </div>
            </form>
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
        ) : rows.length === 0 ? (
          <CardBody>
            <EmptyState text="No students match those filters" />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
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
                    {r.makeUp && <span className="ml-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">make-up</span>}
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
                  {r.replyStatus && <Badge color={replyColor[r.replyStatus]}>{REPLY_STATUS_LABELS[r.replyStatus]}</Badge>}
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
