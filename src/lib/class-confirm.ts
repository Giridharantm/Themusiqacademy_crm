// What a family has told us about a class they were reminded of, as shown to
// staff: confirmed, can't come, or no reply yet. Pure: no database or network.

export type ReplyStatus = "CONFIRMED" | "DECLINED" | "CANCELLED" | "MOVED" | "NO_REPLY";

export const REPLY_STATUS_LABELS: Record<ReplyStatus, string> = {
  CONFIRMED: "Confirmed",
  DECLINED: "Can't come",
  CANCELLED: "Cancelled the class",
  MOVED: "Rescheduled",
  NO_REPLY: "No reply yet",
};

// For a regular class a "No" with nothing booked means the seat is still held, so
// staff are told that rather than just "can't come".
export const REGULAR_REPLY_LABELS: Record<ReplyStatus, string> = { ...REPLY_STATUS_LABELS, DECLINED: "Said no, nothing booked" };

// A booked skip or move says more than a bare "No" (the family went on to choose),
// so it wins; then the latest tap; with neither, a reminder that went out is
// waiting for a reply. Before anything was sent there is nothing to say.
export function replyStatus(i: { sent: boolean; answer: "YES" | "NO" | null; change: "SKIP" | "MOVE" | null }): ReplyStatus | null {
  if (i.change === "MOVE") return "MOVED";
  if (i.change === "SKIP") return "CANCELLED";
  if (i.answer === "YES") return "CONFIRMED";
  if (i.answer === "NO") return "DECLINED";
  return i.sent ? "NO_REPLY" : null;
}

// How many students are in each state, for the headline counts.
export function replyCounts(statuses: (ReplyStatus | null)[]): Record<ReplyStatus, number> {
  const counts: Record<ReplyStatus, number> = { CONFIRMED: 0, DECLINED: 0, CANCELLED: 0, MOVED: 0, NO_REPLY: 0 };
  for (const s of statuses) if (s) counts[s]++;
  return counts;
}
