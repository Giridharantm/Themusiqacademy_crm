import { describe, it, expect } from "vitest";
import { autoSkipDue, autoSkippedText, buttonsRequest, listRequest, parseReplyId, replyId, slotRows, whatNextText, MAX_SLOT_ROWS, REPLY_BUTTON_CANCEL, REPLY_BUTTON_RESCHEDULE } from "./class-reply";
import { parseInboundMessages } from "./whatsapp";
import {
  REMINDER_BUTTON_LABELS,
  REMINDER_OPTION_LABELS,
  TEMPLATE_BODIES,
  TEMPLATE_REMINDER_BUTTONS,
  TEMPLATE_REMINDER_OPTIONS,
  TEMPLATE_REMINDER_PROGRESS_BUTTONS,
  TEMPLATE_REMINDER_PROGRESS_OPTIONS,
  reminderMessage,
  templateRequest,
} from "./whatsapp-notices";
import type { SlotOption } from "./reschedule";

const ids = { studentId: "cstudent000000000000000001", batchId: "cbatch0000000000000000001", date: "2026-11-03" };

describe("reply ids", () => {
  it("round-trips every kind", () => {
    for (const r of [
      { kind: "yes" as const, ...ids },
      { kind: "no" as const, ...ids },
      { kind: "move" as const, ...ids },
      { kind: "cancel" as const, ...ids },
      { kind: "nomove" as const, ...ids },
      { kind: "slot" as const, ...ids, toBatchId: "cbatch0000000000000000002", toDate: "2026-11-04" },
    ]) {
      expect(parseReplyId(replyId(r))).toEqual(r);
    }
  });

  it("stays within WhatsApp's id limits (128 for buttons, 200 for rows)", () => {
    expect(replyId({ kind: "no", ...ids }).length).toBeLessThanOrEqual(128);
    expect(replyId({ kind: "slot", ...ids, toBatchId: "cbatch0000000000000000002", toDate: "2026-11-04" }).length).toBeLessThanOrEqual(200);
  });

  it("rejects anything that isn't ours", () => {
    expect(parseReplyId("hello")).toBeNull();
    expect(parseReplyId("no|s|b|not-a-date")).toBeNull();
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

describe("asking what to do after a No", () => {
  it("offers Reschedule and Cancel as two tap buttons within WhatsApp's 20-character limit", () => {
    expect(REPLY_BUTTON_RESCHEDULE.length).toBeLessThanOrEqual(20);
    expect(REPLY_BUTTON_CANCEL.length).toBeLessThanOrEqual(20);
    const req = buttonsRequest("919845708094", whatNextText("Asha", "Guitar", "17:00"), [
      { id: replyId({ kind: "move", ...ids }), title: REPLY_BUTTON_RESCHEDULE },
      { id: replyId({ kind: "cancel", ...ids }), title: REPLY_BUTTON_CANCEL },
    ]);
    expect(req.interactive.type).toBe("button");
    expect(req.interactive.action.buttons).toHaveLength(2);
    expect(req.interactive.action.buttons.map((b) => parseReplyId(b.reply.id)?.kind)).toEqual(["move", "cancel"]);
    expect(req.interactive.body.text).toBe("Sorry to hear that. What would you like to do about Asha's Guitar class today at 5:00 PM?");
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

  it("asks whether they will attend, keeps the plain reminders' parameters, and has short button labels", () => {
    expect(TEMPLATE_BODIES[TEMPLATE_REMINDER_BUTTONS].endsWith("Will you be able to attend?")).toBe(true);
    expect(TEMPLATE_BODIES[TEMPLATE_REMINDER_BUTTONS].match(/\{\{\d+\}\}/g)).toHaveLength(3);
    expect(TEMPLATE_BODIES[TEMPLATE_REMINDER_PROGRESS_BUTTONS].match(/\{\{\d+\}\}/g)).toHaveLength(5);
    expect(REMINDER_BUTTON_LABELS).toEqual(["Yes, I'll attend", "No, can't attend"]);
    for (const label of REMINDER_BUTTON_LABELS) expect(label.length).toBeLessThanOrEqual(25);
  });
});

describe("reminder with three outcome buttons", () => {
  const r = { studentName: "Asha", courseName: "Guitar", startTime: "17:00" };

  it("uses the options templates, with the same parameters as the Yes / No ones", () => {
    expect(reminderMessage(r, null, ["a", "b", "c"], true)).toEqual({ template: TEMPLATE_REMINDER_OPTIONS, params: ["Asha", "Guitar", "5:00 PM"], buttonPayloads: ["a", "b", "c"] });
    expect(reminderMessage(r, { used: 3, total: 24 }, ["a", "b", "c"], true).template).toBe(TEMPLATE_REMINDER_PROGRESS_OPTIONS);
    expect(TEMPLATE_BODIES[TEMPLATE_REMINDER_OPTIONS].match(/\{\{\d+\}\}/g)).toHaveLength(3);
    expect(TEMPLATE_BODIES[TEMPLATE_REMINDER_PROGRESS_OPTIONS].match(/\{\{\d+\}\}/g)).toHaveLength(5);
  });

  it("keeps using the Yes / No templates unless three buttons are asked for", () => {
    expect(reminderMessage(r, null, ["a", "b"]).template).toBe(TEMPLATE_REMINDER_BUTTONS);
  });

  it("has three short, distinct outcome labels", () => {
    expect(REMINDER_OPTION_LABELS).toEqual(["Yes, I'll attend", "Reschedule", "Can't attend"]);
    for (const label of REMINDER_OPTION_LABELS) expect(label.length).toBeLessThanOrEqual(25);
  });

  it("puts a quick-reply payload on each of the three buttons, in order", () => {
    const req = templateRequest("9845708094", TEMPLATE_REMINDER_OPTIONS, ["Asha", "Guitar", "5:00 PM"], ["y", "m", "c"]);
    expect(req.template.components.slice(1).map((c) => ("index" in c ? c.index : null))).toEqual(["0", "1", "2"]);
  });
});

describe("auto-skip of an unanswered No", () => {
  const missed = { date: new Date(2026, 10, 3), startTime: "17:00" };

  it("tells the family the class was marked missed, and the make-up deadline when there is one", () => {
    const withMakeUp = autoSkippedText("Asha", "Guitar", missed, new Date(2026, 10, 10));
    expect(withMakeUp).toContain("Asha");
    expect(withMakeUp).toContain("5:00 PM");
    expect(withMakeUp).toContain("as missed");
    expect(withMakeUp).toContain("for free until");
    expect(withMakeUp).toContain("Reschedule");
  });

  it("says nothing about a make-up for an instrument that has none", () => {
    expect(autoSkippedText("Asha", "Drums", missed, null)).not.toContain("make it up");
  });

  it("acts from the class's start time, but only for the next 90 minutes", () => {
    const at = (h: number, m: number) => h * 60 + m;
    expect(autoSkipDue("17:00", at(16, 59))).toBe(false); // not started
    expect(autoSkipDue("17:00", at(17, 0))).toBe(true);
    expect(autoSkipDue("17:00", at(18, 30))).toBe(true); // exactly 90 minutes in
    expect(autoSkipDue("17:00", at(18, 31))).toBe(false); // a class long over is left alone
    expect(autoSkipDue("17:00", at(22, 0))).toBe(false);
    expect(autoSkipDue("09:30", at(9, 29))).toBe(false);
  });
});

describe("tapped replies in the webhook", () => {
  const wrap = (message: Record<string, unknown>) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages: [{ id: "wamid.1", from: "919845708094", timestamp: "1793000000", ...message }] } }] }],
  });

  it("reads a template button's payload", () => {
    const [m] = parseInboundMessages(wrap({ type: "button", button: { text: "Reschedule", payload: "no|s|b|2026-11-03" } }));
    expect(m.replyId).toBe("no|s|b|2026-11-03");
    expect(m.text).toBe("Reschedule");
  });

  it("reads a reply button's id", () => {
    const [m] = parseInboundMessages(wrap({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "cancel|s|b|2026-11-03", title: "Cancel the class" } } }));
    expect(m.replyId).toBe("cancel|s|b|2026-11-03");
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
