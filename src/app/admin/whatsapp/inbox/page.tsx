import Link from "next/link";
import { markNumberAsSpam, sendInboxReply, unblockNumberAction } from "@/lib/actions/whatsapp-actions";
import { getThread, listBlocked, listConversations, searchFamilies } from "@/lib/whatsapp-service";
import { isReplyWindowOpen, previewText, replyHoursLeft, isUnread } from "@/lib/whatsapp-inbox";
import { istLabel, normalizePhone, sentMessageText } from "@/lib/whatsapp-notices";
import { Button, Card, CardBody, CardHeader, PageHeader, Textarea, EmptyState } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { MarkReadOnMount } from "@/components/mark-read-on-mount";

type Owners = { students: { id: string; name: string; status: string }[]; lead: { id: string; name: string } | null };

// How a conversation is named in the list: the student(s) it belongs to, else
// the lead, else their WhatsApp profile name, else the bare number.
function titleFor(owners: Owners, name: string | null, phone: string) {
  if (owners.students.length > 0) return owners.students.map((s) => s.name).join(", ");
  return owners.lead?.name ?? name ?? phone;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; q?: string; error?: string; blocked?: string; unblocked?: string; warning?: string }>;
}) {
  const sp = await searchParams;
  const selected = normalizePhone(sp.phone) ?? null;

  const q = sp.q?.trim() ?? "";
  const typedNumber = normalizePhone(q);
  const [conversations, blockedNumbers, found] = await Promise.all([listConversations(), listBlocked(), searchFamilies(q)]);
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

      {(sp.blocked || sp.unblocked) && (
        <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${sp.warning ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          {sp.blocked
            ? `${sp.blocked} is marked as spam and hidden. Anything it sends is ignored, and we will never message it.`
            : `${sp.unblocked} is unblocked.`}
          {sp.warning && <span> WhatsApp itself said: {sp.warning}. (It only lets a business block someone who messaged within the last 24 hours — the number is still ignored here.)</span>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
        <Card className="h-fit">
          <CardHeader title="Conversations" subtitle="Families who wrote to you, newest first" />
          <CardBody className="border-b border-slate-100 space-y-2">
            <form method="get" className="flex gap-2">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Find any family: name or number"
                className="flex-1 min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <Button type="submit" variant="secondary">
                Find
              </Button>
            </form>
            <p className="text-xs text-slate-500">To read the reminders and notices we sent a family that never wrote back, find them here.</p>
            {q && (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
                {typedNumber && (
                  <li>
                    <Link href={{ pathname: "/admin/whatsapp/inbox", query: { phone: typedNumber } }} className="block px-3 py-2 text-sm text-indigo-700 hover:bg-slate-50">
                      Open the chat with {typedNumber}
                    </Link>
                  </li>
                )}
                {found.map((s) => (
                  <li key={s.id} className="px-3 py-2">
                    <p className="text-sm font-medium text-slate-900">
                      {s.name}
                      {s.status !== "ACTIVE" ? <span className="ml-1 text-xs text-slate-400">({s.status.toLowerCase()})</span> : null}
                    </p>
                    <p className="text-xs">
                      {s.phones.length === 0 ? <span className="text-slate-400">no number on file</span> : null}
                      {s.phones.map((p) => (
                        <Link key={p} href={{ pathname: "/admin/whatsapp/inbox", query: { phone: p } }} className="mr-3 text-indigo-600 hover:underline">
                          Chat with {p}
                        </Link>
                      ))}
                    </p>
                  </li>
                ))}
                {!typedNumber && found.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No family matches “{q}”.</li>}
              </ul>
            )}
          </CardBody>
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

        {blockedNumbers.length > 0 && (
          <Card className="h-fit">
            <CardHeader title="Blocked as spam" subtitle="Hidden here and ignored; they can't message you on WhatsApp" />
            <ul className="divide-y divide-slate-100">
              {blockedNumbers.map((b) => (
                <li key={b.phone} className="px-5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900">{b.phone}</p>
                    <p className="text-xs text-slate-500">{b.blockedAt ? istLabel(b.blockedAt) : ""}</p>
                  </div>
                  <form action={unblockNumberAction.bind(null, b.phone)}>
                    <Button type="submit" variant="ghost">
                      Unblock
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}
        </div>

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
                    <form action={markNumberAsSpam.bind(null, selected)}>
                      <ConfirmSubmitButton
                        variant="ghost"
                        className="text-red-600"
                        confirmMessage={`Mark ${selected} as spam? It will be blocked on WhatsApp, hidden from the inbox, and anything it sends will be ignored.`}
                      >
                        Mark as spam
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                }
              />
              {thread.contact && isUnread(thread.contact) && <MarkReadOnMount phone={selected} />}

              <CardBody className="space-y-3 max-h-[55vh] overflow-y-auto bg-panel/40">
                {thread.messages.length === 0 ? (
                  <EmptyState text="No messages" />
                ) : (
                  thread.messages.map((m) => {
                    const inbound = m.kind === "INBOUND";
                    // Automatic messages (reminders, notices, class changes) are shown as chat bubbles with the words the
                    // family got and WhatsApp's receipts, the same as a typed reply.
                    const automatic = m.kind === "REMINDER" || m.kind === "NOTICE";
                    const words = automatic ? (sentMessageText(m)?.text ?? m.summary) : (m.body ?? m.summary);
                    const receipt = inbound ? null : m.status === "FAILED" ? "not delivered" : m.readAt ? "read" : m.deliveredAt ? "delivered" : m.status === "SENT" ? "sent" : m.status === "DRY_RUN" ? "test, not sent" : "sending";
                    return (
                      <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${inbound ? "bg-white border border-line text-slate-900" : automatic ? "bg-emerald-50 border border-emerald-200 text-emerald-950" : "bg-accent text-white"}`}>
                          {automatic && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{m.kind === "REMINDER" ? "Automatic reminder" : "Notice"}</p>}
                          {words}
                          <p className={`mt-1 text-[11px] ${inbound ? "text-slate-400" : automatic ? "text-emerald-700" : "text-white/70"}`}>
                            {istLabel(m.createdAt)}
                            {receipt && <span> · {receipt}</span>}
                            {!inbound && m.status === "FAILED" && m.error && <span className={automatic ? "text-red-600" : "text-red-100"}>: {m.error}</span>}
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
