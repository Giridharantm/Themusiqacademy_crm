import { describe, it, expect } from "vitest";
import { clockLabel, isClockTime, monthBounds, parseEntry, summarise } from "./teacher-attendance";

const TODAY = "2026-11-03";
const input = (over: Partial<Parameters<typeof parseEntry>[0]> = {}) => ({ date: TODAY, status: "PRESENT", time: "10:30", note: "", ...over });

describe("parseEntry", () => {
  it("accepts a present teacher with a time and keeps the note", () => {
    expect(parseEntry(input({ note: "  Taking a comp class for Aarav " }), TODAY)).toEqual({
      ok: true,
      entry: { date: TODAY, status: "PRESENT", time: "10:30", note: "Taking a comp class for Aarav" },
    });
  });

  it("requires the time for a present teacher", () => {
    const r = parseEntry(input({ time: "" }), TODAY);
    expect(r.ok).toBe(false);
  });

  it("lets an absent teacher go without a time, and drops a stale one", () => {
    const r = parseEntry(input({ status: "ABSENT", time: "10:30", note: "Unwell" }), TODAY);
    expect(r).toEqual({ ok: true, entry: { date: TODAY, status: "ABSENT", time: null, note: "Unwell" } });
  });

  it("stores no note rather than an empty one", () => {
    const r = parseEntry(input({ note: "   " }), TODAY);
    expect(r.ok && r.entry.note).toBe(null);
  });

  it("rejects a malformed time", () => {
    expect(parseEntry(input({ time: "25:00" }), TODAY).ok).toBe(false);
    expect(parseEntry(input({ time: "9:30" }), TODAY).ok).toBe(false);
    expect(parseEntry(input({ status: "ABSENT", time: "soon" }), TODAY).ok).toBe(false);
  });

  it("rejects a future day but allows today and the past", () => {
    expect(parseEntry(input({ date: "2026-11-04" }), TODAY).ok).toBe(false);
    expect(parseEntry(input({ date: "2026-10-01" }), TODAY).ok).toBe(true);
  });

  it("rejects a bad date, an unknown status and an over-long note", () => {
    expect(parseEntry(input({ date: "" }), TODAY).ok).toBe(false);
    expect(parseEntry(input({ date: "3/11/2026" }), TODAY).ok).toBe(false);
    expect(parseEntry(input({ status: "LATE" }), TODAY).ok).toBe(false);
    expect(parseEntry(input({ note: "x".repeat(501) }), TODAY).ok).toBe(false);
    expect(parseEntry(input({ note: "x".repeat(500) }), TODAY).ok).toBe(true);
  });
});

describe("clock times", () => {
  it("validates HH:MM", () => {
    expect(isClockTime("00:00")).toBe(true);
    expect(isClockTime("23:59")).toBe(true);
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("10:60")).toBe(false);
  });

  it("labels them the way class times are shown", () => {
    expect(clockLabel("00:05")).toBe("12:05 AM");
    expect(clockLabel("09:30")).toBe("9:30 AM");
    expect(clockLabel("12:00")).toBe("12:00 PM");
    expect(clockLabel("17:45")).toBe("5:45 PM");
  });
});

describe("summarise", () => {
  it("counts present and absent days", () => {
    expect(summarise([{ status: "PRESENT" }, { status: "PRESENT" }, { status: "ABSENT" }])).toEqual({ present: 2, absent: 1, marked: 3 });
    expect(summarise([])).toEqual({ present: 0, absent: 0, marked: 0 });
  });
});

describe("monthBounds", () => {
  it("returns the month's first day and the next month's", () => {
    expect(monthBounds("2026-11")).toEqual({ from: "2026-11-01", to: "2026-12-01" });
  });

  it("rolls December into January", () => {
    expect(monthBounds("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });

  it("rejects anything that isn't yyyy-mm", () => {
    expect(monthBounds("2026-13")).toBe(null);
    expect(monthBounds("nov")).toBe(null);
    expect(monthBounds("")).toBe(null);
  });
});
