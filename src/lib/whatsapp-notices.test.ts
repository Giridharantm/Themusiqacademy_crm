import { describe, it, expect } from "vitest";
import {
  NOTICE_TYPES,
  istDateString,
  istLabel,
  reminderDecision,
  DECISION_LABELS,
  nextReminderDateStr,
  shortDateLabel,
  clockLabel,
  sanitizeParam,
  normalizePhone,
  waNumber,
  recipientPhones,
  templateRequest,
  isStopMessage,
  isStartMessage,
  renderTemplate,
  TEMPLATE_BODIES,
  TEMPLATE_REMINDER,
  TEMPLATE_REMINDER_PROGRESS,
  reminderMessage,
  TEMPLATE_NOTICE,
  TEMPLATE_RESCHEDULED,
} from "./whatsapp-notices";

describe("istDateString", () => {
  it("uses the date in India, not UTC", () => {
    // 20:00 UTC on 26 Oct is already 01:30 on 27 Oct in India
    expect(istDateString(new Date("2026-10-26T20:00:00Z"))).toBe("2026-10-27");
    expect(istDateString(new Date("2026-10-27T04:30:00Z"))).toBe("2026-10-27"); // 10:00 IST
    expect(istDateString(new Date("2026-10-26T18:29:00Z"))).toBe("2026-10-26"); // 23:59 IST
  });
});

describe("labels", () => {
  it("formats dates and clock times", () => {
    expect(shortDateLabel(new Date(2026, 9, 27))).toBe("Tue 27 Oct");
    expect(clockLabel("17:00")).toBe("5:00 PM");
    expect(clockLabel("17:30")).toBe("5:30 PM");
    expect(clockLabel("11:00")).toBe("11:00 AM");
    expect(clockLabel("12:00")).toBe("12:00 PM");
    expect(clockLabel("00:15")).toBe("12:15 AM");
  });
});

describe("sanitizeParam", () => {
  it("removes what WhatsApp rejects in template parameters", () => {
    expect(sanitizeParam("line one\nline   two\t!")).toBe("line one line two !");
    expect(sanitizeParam("   ")).toBe("-");
    expect(sanitizeParam("x".repeat(2000))).toHaveLength(1000);
  });
});

describe("phone helpers", () => {
  it("normalizes Indian and foreign numbers the way the CRM stores them", () => {
    expect(normalizePhone("+91 98457 08094")).toBe("9845708094");
    expect(normalizePhone("098457 08094")).toBe("9845708094");
    expect(normalizePhone("+1 (415) 555-0123")).toBe("+14155550123");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("converts back to the format WhatsApp expects", () => {
    expect(waNumber("9845708094")).toBe("919845708094");
    expect(waNumber("+14155550123")).toBe("14155550123");
  });
});

describe("recipientPhones", () => {
  it("prefers guardian numbers and de-duplicates them", () => {
    expect(recipientPhones(["98457 08094", "+91 9845708094", "98807 08850"], "70000 11111")).toEqual(["9845708094", "9880708850"]);
  });

  it("falls back to the student's own number when no guardian number is usable", () => {
    expect(recipientPhones([null, "abc"], "98457 08094")).toEqual(["9845708094"]);
    expect(recipientPhones([], "98457 08094")).toEqual(["9845708094"]);
  });

  it("returns nothing when there is no valid number", () => {
    expect(recipientPhones([], null)).toEqual([]);
    expect(recipientPhones(["x"], "y")).toEqual([]);
  });
});

describe("templateRequest", () => {
  it("builds the Cloud API payload with sanitized body parameters", () => {
    expect(templateRequest("9845708094", "class_reminder", ["Asha", "Guitar", "5:00\nPM"])).toEqual({
      messaging_product: "whatsapp",
      to: "919845708094",
      type: "template",
      template: {
        name: "class_reminder",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Asha" },
              { type: "text", text: "Guitar" },
              { type: "text", text: "5:00 PM" },
            ],
          },
        ],
      },
    });
  });
});

describe("STOP / START keywords", () => {
  it("matches whole-message keywords only", () => {
    for (const s of ["STOP", "stop", " Stop. ", "unsubscribe", "STOP ALL", "opt out"]) expect(isStopMessage(s)).toBe(true);
    for (const s of ["please don't stop the classes", "stop by tomorrow?", "hi", ""]) expect(isStopMessage(s)).toBe(false);
    for (const s of ["START", "subscribe", "Opt in!"]) expect(isStartMessage(s)).toBe(true);
    for (const s of ["when do classes start", "restart"]) expect(isStartMessage(s)).toBe(false);
  });
});

describe("NOTICE_TYPES", () => {
  it("silences the daily reminder only for notices that cancel or move a class", () => {
    expect(NOTICE_TYPES.TEACHER_LEAVE.suppressesReminder).toBe(true);
    expect(NOTICE_TYPES.RESCHEDULE.suppressesReminder).toBe(true);
    expect(NOTICE_TYPES.CLASS_CANCELLED.suppressesReminder).toBe(true);
    expect(NOTICE_TYPES.ACADEMY_LEAVE.suppressesReminder).toBe(true);
    expect(NOTICE_TYPES.TEACHER_LATE.suppressesReminder).toBe(false);
    expect(NOTICE_TYPES.OTHER.suppressesReminder).toBe(false);
  });
});

describe("renderTemplate", () => {
  it("fills the numbered placeholders the way WhatsApp will", () => {
    expect(renderTemplate(TEMPLATE_BODIES[TEMPLATE_REMINDER], ["Asha", "Guitar", "5:00 PM"])).toBe(
      "Hello! A reminder from The Musiq Academy: Asha's Guitar class is today at 5:00 PM. See you at the academy!"
    );
    expect(renderTemplate(TEMPLATE_BODIES[TEMPLATE_NOTICE], ["Asha", "Guitar", "Tue 27 Oct", "Teacher\nis late"])).toContain("Tue 27 Oct: Teacher is late");
  });

  it("every template uses exactly the placeholders its parameters supply", () => {
    expect(TEMPLATE_BODIES[TEMPLATE_REMINDER].match(/\{\{\d+\}\}/g)).toHaveLength(3);
    expect(TEMPLATE_BODIES[TEMPLATE_RESCHEDULED].match(/\{\{\d+\}\}/g)).toHaveLength(4);
    expect(TEMPLATE_BODIES[TEMPLATE_NOTICE].match(/\{\{\d+\}\}/g)).toHaveLength(4);
  });
});

describe("reminderMessage", () => {
  const r = { studentName: "Asha", courseName: "Guitar", startTime: "17:00" };

  it("adds classes completed vs. subscribed when the student has a current subscription", () => {
    const m = reminderMessage(r, { used: 13, total: 28 });
    expect(m.template).toBe(TEMPLATE_REMINDER_PROGRESS);
    expect(m.params).toEqual(["Asha", "Guitar", "5:00 PM", "13", "28"]);
    expect(renderTemplate(TEMPLATE_BODIES[m.template], m.params)).toBe(
      "Hello! A reminder from The Musiq Academy: Asha's Guitar class is today at 5:00 PM. Classes completed so far: 13 of 28. See you at the academy!"
    );
  });

  it("sends the plain reminder when there is no current subscription", () => {
    expect(reminderMessage(r, null)).toEqual({ template: TEMPLATE_REMINDER, params: ["Asha", "Guitar", "5:00 PM"] });
    expect(reminderMessage(r, { used: 0, total: 0 }).template).toBe(TEMPLATE_REMINDER);
  });

  it("never shows a negative count", () => {
    expect(reminderMessage(r, { used: -2, total: 24 }).params.slice(3)).toEqual(["0", "24"]);
  });
});

describe("istLabel", () => {
  it("shows India time regardless of the server's time zone", () => {
    expect(istLabel(new Date("2026-10-27T11:11:00Z"))).toMatch(/27 Oct.*4:41\s?pm/i);
    expect(istLabel(new Date("2026-10-26T20:00:00Z"))).toMatch(/27 Oct.*1:30\s?am/i);
  });
});

describe("reminderDecision", () => {
  const base = { classHasNotice: false, studentOff: false, skippedToday: false, phone: "9845708094", consented: true };

  it("sends when nothing stops it", () => {
    expect(reminderDecision(base)).toBe("SEND");
  });

  it("applies the first matching reason, in order", () => {
    expect(reminderDecision({ ...base, classHasNotice: true, studentOff: true, consented: false })).toBe("CLASS_NOTICE");
    expect(reminderDecision({ ...base, studentOff: true, skippedToday: true })).toBe("STUDENT_OFF");
    expect(reminderDecision({ ...base, skippedToday: true, phone: null })).toBe("SKIPPED");
    expect(reminderDecision({ ...base, phone: null, consented: false })).toBe("NO_PHONE");
    expect(reminderDecision({ ...base, consented: false })).toBe("NO_CONSENT");
  });

  it("has a label for every decision", () => {
    for (const d of ["SEND", "CLASS_NOTICE", "STUDENT_OFF", "SKIPPED", "NO_PHONE", "NO_CONSENT"] as const) expect(DECISION_LABELS[d]).toBeTruthy();
  });
});

describe("nextReminderDateStr", () => {
  it("is today before 10:00 India time and tomorrow after it", () => {
    expect(nextReminderDateStr(new Date("2026-10-27T03:00:00Z"))).toBe("2026-10-27"); // Tue 08:30 IST
    expect(nextReminderDateStr(new Date("2026-10-27T04:29:00Z"))).toBe("2026-10-27"); // Tue 09:59 IST
    expect(nextReminderDateStr(new Date("2026-10-27T04:30:00Z"))).toBe("2026-10-28"); // Tue 10:00 IST -> Wed
  });

  it("skips Monday, the holiday", () => {
    expect(nextReminderDateStr(new Date("2026-10-25T12:00:00Z"))).toBe("2026-10-27"); // Sun evening -> Tue
    expect(nextReminderDateStr(new Date("2026-10-26T05:00:00Z"))).toBe("2026-10-27"); // Mon -> Tue
    expect(nextReminderDateStr(new Date("2026-10-26T22:00:00Z"))).toBe("2026-10-27"); // Mon 03:30 IST Tue is today
  });
});
