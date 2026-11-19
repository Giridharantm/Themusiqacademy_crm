import { describe, it, expect } from "vitest";
import { sentMessageText, TEMPLATE_BODIES, renderTemplate, reminderMessage } from "./whatsapp-notices";

describe("sentMessageText", () => {
  it("returns the stored words exactly when they were kept", () => {
    const m = reminderMessage({ studentName: "Nihal Sandeep", courseName: "Drums", startTime: "20:00" }, { used: 13, total: 28 }, ["a", "b", "c"], true);
    const body = renderTemplate(TEMPLATE_BODIES[m.template], m.params);
    expect(sentMessageText({ template: m.template, body, summary: "Drums 8:00 PM · Nihal Sandeep" })).toEqual({ text: body, exact: true });
    expect(body).toContain("Classes completed so far: 13 of 28");
  });

  it("rebuilds an older class reminder from its template and summary, without the class count", () => {
    const r = sentMessageText({ template: "class_reminder_progress_options", body: null, summary: "Carnatic Vocals 4:30 PM · Aarav K" });
    expect(r?.exact).toBe(false);
    expect(r?.text).toBe("Hello! A reminder from The Musiq Academy: Aarav K's Carnatic Vocals class is today at 4:30 PM. Classes completed so far: … of …. Will you be able to attend?");
  });

  it("rebuilds the plain reminder with nothing missing", () => {
    expect(sentMessageText({ template: "class_reminder", body: null, summary: "Guitar 5:00 PM · Dev" })?.text).toBe("Hello! A reminder from The Musiq Academy: Dev's Guitar class is today at 5:00 PM. See you at the academy!");
  });

  it("gives up (null) on anything it cannot rebuild", () => {
    expect(sentMessageText({ template: "class_notice", body: null, summary: "Other update · Drums · Nihal" })).toBeNull();
    expect(sentMessageText({ template: "class_reminder", body: null, summary: "garbled" })).toBeNull();
    expect(sentMessageText({ template: "text", body: null, summary: null })).toBeNull();
  });
});
