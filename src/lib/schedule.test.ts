import { describe, it, expect } from "vitest";
import { timeSlotsForDay, formatTimeLabel, dayCodeFromDate, sortBatches } from "./schedule";

describe("timeSlotsForDay", () => {
  it("returns no slots on Monday (holiday)", () => {
    expect(timeSlotsForDay("MON")).toEqual([]);
  });

  it("returns hourly slots from 3pm to 9pm on weekdays", () => {
    const slots = timeSlotsForDay("TUE");
    expect(slots[0]).toMatchObject({ start: "15:00", end: "16:00" });
    expect(slots[slots.length - 1]).toMatchObject({ start: "20:00", end: "21:00" });
    expect(slots).toHaveLength(6);
  });

  it("returns 2pm-8pm on Saturday", () => {
    const slots = timeSlotsForDay("SAT");
    expect(slots[0].start).toBe("14:00");
    expect(slots[slots.length - 1].end).toBe("20:00");
  });

  it("returns 11am-5pm on Sunday", () => {
    const slots = timeSlotsForDay("SUN");
    expect(slots[0].start).toBe("11:00");
    expect(slots[slots.length - 1].end).toBe("17:00");
  });
});

describe("formatTimeLabel", () => {
  it("formats midnight, noon, and afternoon hours correctly", () => {
    expect(formatTimeLabel("00:00")).toBe("12:00 AM");
    expect(formatTimeLabel("12:00")).toBe("12:00 PM");
    expect(formatTimeLabel("15:00")).toBe("3:00 PM");
  });
});

describe("dayCodeFromDate", () => {
  it("maps a known Saturday and Sunday correctly", () => {
    // 2026-08-29 is a Saturday, 2026-08-30 is a Sunday.
    expect(dayCodeFromDate(new Date(2026, 7, 29))).toBe("SAT");
    expect(dayCodeFromDate(new Date(2026, 7, 30))).toBe("SUN");
  });
});

describe("sortBatches", () => {
  it("orders by instrument name, then day (Tue..Sun), then start time", () => {
    const batches = [
      { course: { name: "Guitar" }, dayOfWeek: "SUN", startTime: "12:00" },
      { course: { name: "Drums" }, dayOfWeek: "TUE", startTime: "16:00" },
      { course: { name: "Guitar" }, dayOfWeek: "TUE", startTime: "15:00" },
    ];
    const sorted = sortBatches(batches);
    expect(sorted.map((b) => `${b.course.name}-${b.dayOfWeek}-${b.startTime}`)).toEqual([
      "Drums-TUE-16:00",
      "Guitar-TUE-15:00",
      "Guitar-SUN-12:00",
    ]);
  });
});
