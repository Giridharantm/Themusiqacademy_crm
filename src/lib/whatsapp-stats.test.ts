import { describe, it, expect } from "vitest";
import { buildDailyStats, explainFailure, groupFailures, istDay, type StatRow } from "./whatsapp-stats";
import { createsLead, isSystemNotice, parseInboundMessages, parseStatusUpdates } from "./whatsapp";

const at = (iso: string) => new Date(iso);
const row = (o: Partial<StatRow>): StatRow => ({ kind: "REMINDER", status: "SENT", createdAt: at("2026-11-19T04:30:00Z"), deliveredAt: null, readAt: null, error: null, ...o });
const NOW = at("2026-11-19T13:00:00Z"); // 18:30 India time, Thursday 19 Nov

describe("istDay", () => {
  it("uses the India date, not UTC", () => {
    expect(istDay(at("2026-11-19T20:00:00Z"))).toBe("2026-11-20"); // 01:30 IST next day
    expect(istDay(at("2026-11-19T18:29:00Z"))).toBe("2026-11-19");
  });
});

describe("buildDailyStats", () => {
  const rows: StatRow[] = [
    row({ deliveredAt: at("2026-11-19T04:31:00Z"), readAt: at("2026-11-19T05:00:00Z") }), // read
    row({ deliveredAt: at("2026-11-19T04:31:00Z") }), // delivered
    row({}), // sent, no receipt
    row({ status: "FAILED", error: "131042 · Business eligibility payment issue" }),
    row({ kind: "REPLY", deliveredAt: at("2026-11-19T06:00:00Z") }),
    row({ kind: "INBOUND", status: "RECEIVED" }),
    row({ createdAt: at("2026-11-18T04:30:00Z") }), // yesterday
  ];
  const days = buildDailyStats(rows, NOW, 3, at("2026-11-19T00:00:00Z"));

  it("returns one entry per India day, newest first", () => {
    expect(days.map((d) => d.dateStr)).toEqual(["2026-11-19", "2026-11-18", "2026-11-17"]);
  });

  it("counts sent, delivered, read and failed separately", () => {
    expect(days[0].reminders).toEqual({ total: 4, accepted: 3, delivered: 2, read: 1, failed: 1, waiting: 1 });
    expect(days[0].replies.delivered).toBe(1);
    expect(days[0].inbound).toBe(1);
    expect(days[1].reminders.total).toBe(1);
    expect(days[2].reminders.total).toBe(0);
  });

  it("marks days before the first stored receipt as untracked", () => {
    expect(days.map((d) => d.receiptsTracked)).toEqual([true, false, false]);
    expect(buildDailyStats([], NOW, 1, null)[0].receiptsTracked).toBe(false);
  });

  it("ignores rows older than the window", () => {
    expect(buildDailyStats([row({ createdAt: at("2026-11-01T04:30:00Z") })], NOW, 3, null).every((d) => d.reminders.total === 0)).toBe(true);
  });
});

describe("explainFailure / groupFailures", () => {
  it("explains the payment error in plain words", () => {
    const e = explainFailure("131042 · Business eligibility payment issue · Message failed to send because your WhatsApp Business account has unsettled payments.");
    expect(e.code).toBe("131042");
    expect(e.title).toMatch(/payment/i);
    expect(e.action).toMatch(/Billing/);
  });

  it("falls back for unknown or empty errors", () => {
    expect(explainFailure("999999 · Something new").title).toBe("Something new");
    expect(explainFailure(null).title).toBe("Unknown reason");
  });

  it("groups today's failures by cause, biggest first, and skips other days and inbound rows", () => {
    const f = (n: number, error: string, extra: Partial<StatRow> = {}) => Array.from({ length: n }, () => row({ status: "FAILED", error, ...extra }));
    const groups = groupFailures([...f(3, "131026 · Message undeliverable"), ...f(60, "131042 · payment"), ...f(5, "131042 · payment", { createdAt: at("2026-11-18T04:30:00Z") })], "2026-11-19");
    expect(groups.map((g) => [g.code, g.count])).toEqual([
      ["131042", 60],
      ["131026", 3],
    ]);
  });
});

describe("delivery receipts and system notices from the webhook", () => {
  const payload = (value: unknown) => ({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ field: "messages", value }] }] });

  it("reads the time of a delivered receipt", () => {
    const [s] = parseStatusUpdates(payload({ statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1795000000" }] }));
    expect(s.status).toBe("delivered");
    expect(s.at?.getTime()).toBe(1795000000 * 1000);
  });

  it("gives null for a receipt with no usable time", () => {
    expect(parseStatusUpdates(payload({ statuses: [{ id: "wamid.1", status: "read" }] }))[0].at).toBeNull();
  });

  it("says what a WhatsApp system notice is, and never makes it a lead", () => {
    const [m] = parseInboundMessages(payload({ messages: [{ id: "s1", from: "917892982791", type: "system", system: { type: "user_changed_number", new_wa_id: "919800000000" } }] }));
    expect(m.text).toBe("[WhatsApp notice] this contact changed their number to 919800000000");
    expect(createsLead(m.type)).toBe(false);
    expect(isSystemNotice(m.type)).toBe(true);
  });

  it("uses WhatsApp's own wording when it sends one, and a generic line otherwise", () => {
    expect(parseInboundMessages(payload({ messages: [{ id: "s2", from: "91", type: "system", system: { body: "Aldrin changed from 9198 to 9199" } }] }))[0].text).toBe("[WhatsApp notice] Aldrin changed from 9198 to 9199");
    expect(parseInboundMessages(payload({ messages: [{ id: "s3", from: "91", type: "system" }] }))[0].text).toMatch(/^\[WhatsApp notice\]/);
  });

  it("does not turn reactions into leads but still turns text into one", () => {
    expect(createsLead("reaction")).toBe(false);
    expect(createsLead("text")).toBe(true);
    expect(createsLead("unsupported")).toBe(false);
  });
});
