import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, PageHeader, StatCard, EmptyState, Badge } from "@/components/ui";
import { NOTICE_TYPES, istLabel } from "@/lib/whatsapp-notices";
import { isDryRun, whatsappConfigured } from "@/lib/whatsapp-send";
import { format } from "date-fns";

const statusColors: Record<string, string> = { SENT: "green", FAILED: "red", PENDING: "yellow", DRY_RUN: "blue" };

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; ok?: string; failed?: string; skipped?: string }>;
}) {
  const { sent, ok, failed, skipped } = await searchParams;

  const [optedIn, activeStudents, notices, messages] = await Promise.all([
    prisma.whatsAppContact.count({ where: { optedIn: true } }),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.notice.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.whatsAppMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const configured = whatsappConfigured();

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        subtitle="Daily class reminders at 10:00 AM and ad hoc notices to students' families"
        action={
          <Link href="/admin/whatsapp/new" className="inline-flex items-center px-3.5 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-dark">
            New notice
          </Link>
        }
      />

      {sent && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Notice sent: {ok ?? 0} message{ok === "1" ? "" : "s"} handed to WhatsApp
          {failed && failed !== "0" ? `, ${failed} failed (see the log below)` : ""}
          {skipped && skipped !== "0" ? `, ${skipped} number${skipped === "1" ? "" : "s"} skipped because they haven't agreed to WhatsApp messages` : ""}.
        </div>
      )}

      {!configured && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          WhatsApp sending isn&apos;t switched on yet (the server has no WhatsApp access token). You can prepare notices, but nothing will be sent.
        </div>
      )}
      {isDryRun() && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Test mode: messages are recorded here but not actually sent.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Active students" value={activeStudents} />
        <StatCard label="Numbers that agreed to WhatsApp" value={optedIn} hint="A family agrees by messaging 70901 20000, or you record it on the student's page" />
        <StatCard label="Daily reminder" value="10:00 AM" hint="Every class day, for that day's classes. Monday is a holiday." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Recent notices" />
          {notices.length === 0 ? (
            <CardBody>
              <EmptyState text="No notices sent yet" />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notices.map((n) => (
                <li key={n.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {NOTICE_TYPES[n.type].label} · {format(n.date, "EEE d MMM")}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {n.batchIds.length} class{n.batchIds.length === 1 ? "" : "es"} · {n.recipientCount} message{n.recipientCount === 1 ? "" : "s"}
                      {n.message ? ` · ${n.message}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{n.sentAt ? istLabel(n.sentAt) : "Not sent"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Message log" subtitle="The last 50 messages, newest first" />
          {messages.length === 0 ? (
            <CardBody>
              <EmptyState text="Nothing sent yet" />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {messages.map((m) => (
                <li key={m.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900 truncate">{m.summary ?? m.template}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {m.kind.toLowerCase()} · {m.phone} · {istLabel(m.createdAt)}
                    </p>
                    {m.error && <p className="text-xs text-red-600 mt-0.5 break-words">{m.error}</p>}
                  </div>
                  <Badge color={statusColors[m.status]}>{m.status.replace("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
