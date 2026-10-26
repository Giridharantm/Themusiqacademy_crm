import Link from "next/link";
import { sendInboxReply } from "@/lib/actions/whatsapp-actions";
import { getThread, listConversations } from "@/lib/whatsapp-service";
import { isReplyWindowOpen, previewText, replyHoursLeft, isUnread } from "@/lib/whatsapp-inbox";
import { istLabel, normalizePhone } from "@/lib/whatsapp-notices";
import { Card, CardBody, CardHeader, PageHeader, Textarea, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { MarkReadOnMount } from "@/components/mark-read-on-mount";

type Owners = { students: { id: string; name: string; status: string }[]; lead: { id: string; name: string } | null };

// How a conversation is named in the list: the student(s) it belongs to, else
// the lead, else their WhatsApp profile name, else the bare number.
function titleFor(owners: Owners, name: string | null, phone: string) {
  if (owners.students.length > 0) return owners.students.map((s) => s.name).join(", ");
  return owners.lead?.name ?? name ?? phone;
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ phone?: string; error?: string }> }) {
  const sp = await searchParams;
  const selected = normalizePhone(sp.phone) ?? null;

  const conversations = await listConversations();
  const thread = selected ? await getThread(selected) : null;
  const windowOpen = isReplyWindowOpen(thread?.contact?.lastInboundAt);

  return (
    <div>
      <PageHeader
        title="WhatsApp inbox"
        subtitle="Replies from students' families and new enquiries to 70901 20000. Answer here — replies go out as The Musiq Academy."
        action={
          <Link href="/admin/whatsapp" className="text-sm text-indigo-600 hover:underline">
            Back to WhatsApp
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="h-fit">
          <CardHeader title="Conversations" subtitle="Newest message first" />
          {conversations.length === 0 ? (
            <CardBody>
              <EmptyState text="No messages yet. Replies to your reminders and notices will show up here." />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.phone}>
                  <Link
                    href={{ pathname: "/admin/whatsapp/inbox", query: { phone: c.phone } }}
                    className={`block px-5 py-3 hover:bg-slate-50 ${selected === c.phone ? "bg-slate-50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${c.unread ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>
                        {titleFor(c.owners, c.name, c.phone)}
                      </p>
                      <span className="text-xs text-slate-400 shrink-0">{istLabel(c.lastInboundAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-xs truncate ${c.unread ? "text-slate-800" : "text-slate-500"}`}>
                        {c.last && c.last.kind !== "INBOUND" ? "You: " : ""}
                        {previewText(c.last?.body ?? c.last?.summary)}
                      </p>
                      {c.unread && <span className="h-2.5 w-2.5 rounded-full bg-accent shrink-0" aria-label="Unread" />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2 h-fit">
          {!thread || !selected ? (
            <CardBody>
              <EmptyState text="Choose a conversation to read and reply" />
            </CardBody>
          ) : (
            <>
              <CardHeader
                title={titleFor(thread.owners, thread.contact?.name ?? null, selected)}
                subtitle={`${selected}${thread.contact?.name && thread.owners.students.length > 0 ? ` · WhatsApp name: ${thread.contact.name}` : ""}`}
                action={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {thread.owners.students.map((s) => (
                      <Link key={s.id} href={`/admin/students/${s.id}`} className="text-xs text-indigo-600 hover:underline">
                        {s.name}&apos;s page
                      </Link>
                    ))}
                    {thread.owners.lead && (
                      <Link href={`/admin/leads/${thread.owners.lead.id}`} className="text-xs text-indigo-600 hover:underline">
                        Lead: {thread.owners.lead.name}
                      </Link>
                    )}
                    <Link href="/admin/whatsapp/new" className="text-xs text-indigo-600 hover:underline">
                      New notice
                    </Link>
                  </div>
                }
              />
              {thread.contact && isUnread(thread.contact) && <MarkReadOnMount phone={selected} />}

              <CardBody className="space-y-3 max-h-[55vh] overflow-y-auto bg-panel/40">
                {thread.messages.length === 0 ? (
                  <EmptyState text="No messages" />
                ) : (
                  thread.messages.map((m) => {
                    if (m.kind === "REMINDER" || m.kind === "NOTICE") {
                      return (
                        <div key={m.id} className="text-center text-xs text-slate-500">
                          {m.kind === "REMINDER" ? "Reminder sent" : "Notice sent"}: {m.summary} · {istLabel(m.createdAt)}
                          {m.status === "FAILED" && <span className="text-red-600"> · failed: {m.error}</span>}
                        </div>
                      );
                    }
                    const inbound = m.kind === "INBOUND";
                    return (
                      <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${inbound ? "bg-white border border-line text-slate-900" : "bg-accent text-white"}`}>
                          {m.body ?? m.summary}
                          <p className={`mt-1 text-[11px] ${inbound ? "text-slate-400" : "text-white/70"}`}>
                            {istLabel(m.createdAt)}
                            {!inbound && m.status === "FAILED" && <span className="text-red-100"> · not delivered{m.error ? `: ${m.error}` : ""}</span>}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardBody>

              <CardBody className="border-t border-slate-100">
                {sp.error && <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sp.error}</p>}
                {windowOpen ? (
                  <form action={sendInboxReply} className="space-y-3">
                    <input type="hidden" name="phone" value={selected} />
                    <Textarea label="Reply" name="text" rows={3} required placeholder="Type your reply…" />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">
                        Sent as The Musiq Academy. You can reply in free text for about {replyHoursLeft(thread.contact?.lastInboundAt)} more hour
                        {replyHoursLeft(thread.contact?.lastInboundAt) === 1 ? "" : "s"}.
                      </p>
                      <SubmitButton pendingText="Sending…">Send reply</SubmitButton>
                    </div>
                  </form>
                ) : (
                  <p className="text-sm text-amber-700">
                    The 24-hour window for free-text replies has closed. To message this family again, send a{" "}
                    <Link href="/admin/whatsapp/new" className="underline">
                      notice
                    </Link>{" "}
                    (an approved template), or wait for them to write to you.
                  </p>
                )}
              </CardBody>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
