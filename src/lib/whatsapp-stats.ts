// Daily WhatsApp delivery numbers and plain-language failure reasons for the
// admin's WhatsApp page. Pure functions (no database) so they can be unit-tested.

export type StatRow = {
  kind: "REMINDER" | "NOTICE" | "REPLY" | "INBOUND";
  status: string; // PENDING | SENT | FAILED | DRY_RUN | RECEIVED
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
  error: string | null;
};

export type Counts = {
  total: number; // messages we tried to send
  accepted: number; // WhatsApp took them (sent, delivered or read)
  delivered: number; // reached the phone (delivered or read receipt)
  read: number;
  failed: number;
  waiting: number; // accepted but no delivery receipt (phone off, or receipts not tracked)
};

export type DayStats = {
  dateStr: string; // India date, YYYY-MM-DD
  reminders: Counts;
  notices: Counts;
  replies: Counts;
  inbound: number;
  receiptsTracked: boolean; // false for days before delivery receipts were stored
};

const IST_OFFSET_MS = 5.5 * 3600e3;

// The India calendar date of a moment, "YYYY-MM-DD".
export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const emptyCounts = (): Counts => ({ total: 0, accepted: 0, delivered: 0, read: 0, failed: 0, waiting: 0 });

function add(c: Counts, r: StatRow) {
  c.total++;
  if (r.status === "FAILED") {
    c.failed++;
    return;
  }
  if (r.status !== "SENT") return; // pending / test-mode rows count as tried, not accepted
  c.accepted++;
  if (r.readAt) c.read++;
  if (r.deliveredAt || r.readAt) c.delivered++;
  else c.waiting++;
}

// One entry per India day, newest first, for the `days` days ending at `now`.
// `trackedFrom` is the first moment a delivery receipt was stored: earlier days
// can't say "delivered", so the table shows a dash there instead of a wrong 0.
export function buildDailyStats(rows: StatRow[], now: Date, days: number, trackedFrom: Date | null): DayStats[] {
  const out = new Map<string, DayStats>();
  for (let i = 0; i < days; i++) {
    const dateStr = istDay(new Date(now.getTime() - i * 864e5));
    out.set(dateStr, {
      dateStr,
      reminders: emptyCounts(),
      notices: emptyCounts(),
      replies: emptyCounts(),
      inbound: 0,
      receiptsTracked: trackedFrom !== null && dateStr >= istDay(trackedFrom),
    });
  }
  for (const r of rows) {
    const day = out.get(istDay(r.createdAt));
    if (!day) continue;
    if (r.kind === "INBOUND") day.inbound++;
    else if (r.kind === "REMINDER") add(day.reminders, r);
    else if (r.kind === "NOTICE") add(day.notices, r);
    else if (r.kind === "REPLY") add(day.replies, r);
  }
  return Array.from(out.values());
}

export type FailureGroup = { reason: string; count: number; code: string | null; title: string; action: string };

// What a WhatsApp error code means for the person running the academy, and what to do.
// Codes are Meta's (the log stores them as "131042 · title · detail").
const KNOWN: Record<string, { title: string; action: string }> = {
  "131042": {
    title: "WhatsApp payment problem",
    action: "The academy's WhatsApp Business account has unpaid charges, so WhatsApp refuses to send class messages (replies to messages families sent you still work). Open business.facebook.com > Billing & payments, pay what is outstanding and check the payment method on the WhatsApp account. Then press \"Send failed messages again\".",
  },
  "131047": {
    title: "Family hasn't written in the last 24 hours",
    action: "A free-text message can only go to someone who messaged in the last 24 hours. Class reminders use approved templates and are not affected.",
  },
  "131026": {
    title: "Message undeliverable",
    action: "The number isn't on WhatsApp, or the person has an old WhatsApp version or blocked business messages. Check the number on the student's page.",
  },
  "131049": {
    title: "WhatsApp held the message back",
    action: "WhatsApp limits messages to people who have not engaged with the number recently. Nothing to fix; it usually clears by itself.",
  },
  "130429": { title: "Sending too fast", action: "WhatsApp's rate limit was hit. Press \"Send failed messages again\" in a few minutes." },
  "131048": { title: "Flagged as spam", action: "WhatsApp slowed this number because too many people reported or ignored messages. Check the message quality rating in WhatsApp Manager." },
  "131056": { title: "Too many messages to one person", action: "Several messages to the same number in a short time. Try again later." },
  "132001": { title: "Template not found or not approved", action: "The message template name or language does not match an approved one in WhatsApp Manager." },
  "132015": { title: "Template paused", action: "Meta paused this template because of low quality. Check WhatsApp Manager > Message templates." },
  "190": { title: "Access token expired", action: "The server's WhatsApp access token stopped working. A new token has to be created in Meta and put on the server." },
  "131031": { title: "WhatsApp account locked", action: "Meta restricted the WhatsApp Business account. Check WhatsApp Manager for the reason." },
};

export function explainFailure(error: string | null): { code: string | null; title: string; action: string } {
  const text = (error ?? "").trim();
  const code = text.match(/^(\d{3,6})\b/)?.[1] ?? null;
  const known = code ? KNOWN[code] : undefined;
  if (known) return { code, ...known };
  return { code, title: text ? text.split(" · ")[1] ?? text.slice(0, 80) : "Unknown reason", action: "WhatsApp gave no known fix for this one. The full reason is in the message log." };
}

// Today's failures grouped by cause, biggest first.
export function groupFailures(rows: StatRow[], dateStr: string): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();
  for (const r of rows) {
    if (r.status !== "FAILED" || r.kind === "INBOUND" || istDay(r.createdAt) !== dateStr) continue;
    const e = explainFailure(r.error);
    const key = e.code ?? e.title;
    const g = groups.get(key) ?? { reason: r.error ?? "", count: 0, code: e.code, title: e.title, action: e.action };
    g.count++;
    groups.set(key, g);
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}
