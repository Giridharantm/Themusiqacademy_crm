import { describe, it, expect } from "vitest";
import { listRequest, parseReplyId, replyId, slotRows, MAX_SLOT_ROWS } from "./class-reply";
import { parseInboundMessages } from "./whatsapp";
import { REMINDER_BUTTON_LABELS, TEMPLATE_BODIES, TEMPLATE_REMINDER_BUTTONS, TEMPLATE_REMINDER_PROGRESS_BUTTONS, reminderMessage, templateRequest } from "./whatsapp-notices";
import type { SlotOption } from "./reschedule";

const ids = { studentId: "cstudent000000000000000001", batchId: "cbatch0000000000000000001", date: "2026-11-03" };

describe("reply ids", () => {
  it("round-trips every kind", () => {
    for (const r of [
      { kind: "cant" as const, ...ids },
      { kind: "move" as const, ...ids },
      { kind: "nomove" as const, ...ids },
      { kind: "slot" as const, ...ids, toBatchId: "cbatch0000000000000000002", toDate: "2026-11-04" },
    ]) {
      expect(parseReplyId(replyId(r))).toEqual(r);
    }
  });

  it("stays within WhatsApp's id limits (128 for buttons, 200 for rows)", () => {
    expect(replyId({ kind: "cant", ...ids }).length).toBeLessThanOrEqual(128);
    expect(replyId({ kind: "slot", ...ids, toBatchId: "cbatch0000000000000000002", toDate: "2026-11-04" }).length).toBeLessThanOrEqual(200);
  });

  it("rejects anything that isn't ours", () => {
    expect(parseReplyId("hello")).toBeNull();
    expect(parseReplyId("cant|s|b|not-a-date")).toBeNull();
    expect(parseReplyId("slot|s|b|2026-11-03")).toBeNull(); // no target slot
    expect(parseReplyId("delete|s|b|2026-11-03")).toBeNull();
  });
});

const option = (i: number): SlotOption => ({
  batchId: `b${i}`,
  date: new Date(2026, 10, 3 + (i % 5)),
  dateKey: `2026-11-0${3 + (i % 5)}`,
  dayOfWeek: "TUE",
  startTime: "18:00",
  endTime: "19:00",
  seatsLeft: 2,
});

describe("slot list", () => {
  it("offers at most 9 slots plus a way out, 10 rows in all", () => {
    const rows = slotRows(ids, Array.from({ length: 20 }, (_, i) => option(i)), "Guitar");
    expect(rows).toHaveLength(MAX_SLOT_ROWS + 1);
    expect(parseReplyId(rows[rows.length - 1].id)?.kind).toBe("nomove");
  });

  it("keeps row titles within WhatsApp's 24 characters and never shows seat counts", () => {
    const rows = slotRows(ids, [option(0)], "Guitar");
    expect(rows[0].title).toBe("Tue 3 Nov · 6:00 PM");
    expect(rows[0].title.length).toBeLessThanOrEqual(24);
    expect(JSON.stringify(rows)).not.toMatch(/seat/i);
  });

  it("builds a list message for the right number", () => {
    const req = listRequest("919845708094", "Pick one", slotRows(ids, [option(0)], "Guitar"));
    expect(req.to).toBe("919845708094");
    expect(req.type).toBe("interactive");
    expect(req.interactive.type).toBe("list");
    expect(req.interactive.action.button.length).toBeLessThanOrEqual(20);
  });
});

describe("reminder with buttons", () => {
  const r = { studentName: "Asha", courseName: "Guitar", startTime: "17:00" };

  it("uses the button templates and passes the ids through", () => {
    expect(reminderMessage(r, null, ["a", "b"])).toEqual({ template: TEMPLATE_REMINDER_BUTTONS, params: ["Asha", "Guitar", "5:00 PM"], buttonPayloads: ["a", "b"] });
    expect(reminderMessage(r, { used: 3, total: 24 }, ["a", "b"]).template).toBe(TEMPLATE_REMINDER_PROGRESS_BUTTONS);
  });

  it("is unchanged without buttons", () => {
    expect(reminderMessage(r, null)).not.toHaveProperty("buttonPayloads");
  });

  it("puts a quick-reply payload on each button, in order", () => {
    const req = templateRequest("9845708094", TEMPLATE_REMINDER_BUTTONS, ["Asha", "Guitar", "5:00 PM"], ["one", "two"]);
    expect(req.template.components.slice(1)).toEqual([
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "one" }] },
      { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: "two" }] },
    ]);
  });

  it("has the same wording as the plain reminders and short button labels", () => {
    expect(TEMPLATE_BODIES[TEMPLATE_REMINDER_BUTTONS]).toBe(TEMPLATE_BODIES["class_reminder"]);
    expect(TEMPLATE_BODIES[TEMPLATE_REMINDER_PROGRESS_BUTTONS]).toBe(TEMPLATE_BODIES["class_reminder_progress"]);
    for (const label of REMINDER_BUTTON_LABELS) expect(label.length).toBeLessThanOrEqual(25);
  });
});

describe("tapped replies in the webhook", () => {
  const wrap = (message: Record<string, unknown>) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages: [{ id: "wamid.1", from: "919845708094", timestamp: "1793000000", ...message }] } }] }],
  });

  it("reads a template button's payload", () => {
    const [m] = parseInboundMessages(wrap({ type: "button", button: { text: "Reschedule", payload: "move|s|b|2026-11-03" } }));
    expect(m.replyId).toBe("move|s|b|2026-11-03");
    expect(m.text).toBe("Reschedule");
  });

  it("reads a list row's id", () => {
    const [m] = parseInboundMessages(wrap({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "slot|s|b|2026-11-03|b2|2026-11-04", title: "Wed 4 Nov · 6:00 PM" } } }));
    expect(m.replyId).toBe("slot|s|b|2026-11-03|b2|2026-11-04");
  });

  it("has no reply id for ordinary text", () => {
    const [m] = parseInboundMessages(wrap({ type: "text", text: { body: "Can I take a comp class on Friday?" } }));
    expect(m.replyId).toBeNull();
  });
});
