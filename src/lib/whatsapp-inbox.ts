// Pure rules for the WhatsApp inbox: when staff may reply in free text, what
// counts as unread, and cleaning up a reply before it is sent. Kept free of
// Next/Prisma imports so it can be unit-tested.

// WhatsApp only lets a business send free-text messages within 24 hours of the
// customer's last message; after that only an approved template can start the
// conversation again.
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isReplyWindowOpen(lastInboundAt: Date | null | undefined, now = new Date()): boolean {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < REPLY_WINDOW_MS;
}

// Hours left to reply in free text, rounded up, or 0 when the window is closed.
export function replyHoursLeft(lastInboundAt: Date | null | undefined, now = new Date()): number {
  if (!isReplyWindowOpen(lastInboundAt, now)) return 0;
  return Math.ceil((REPLY_WINDOW_MS - (now.getTime() - lastInboundAt!.getTime())) / 3_600_000);
}

// A conversation is unread from the moment a new message arrives until staff
// open it.
export function isUnread(c: { lastInboundAt: Date | null; lastReadAt: Date | null }): boolean {
  return !!c.lastInboundAt && (!c.lastReadAt || c.lastReadAt < c.lastInboundAt);
}

export const MAX_REPLY_LENGTH = 1000;

// Returns the text to send, or null if there is nothing worth sending.
export function cleanReplyText(raw: string): string | null {
  const text = raw.replace(/\r\n/g, "\n").trim();
  return text ? text.slice(0, MAX_REPLY_LENGTH) : null;
}

// One short line for the conversation list.
export function previewText(body: string | null | undefined, max = 70): string {
  const flat = (body ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}
