import { describe, it, expect } from "vitest";
import { addWorkingDays, changeOutcome, dateKey, isWorkingDay, makeUpDeadline, seatLimit, slotOptions, type SlotBatch } from "./reschedule";

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};

describe("working days", () => {
  it("treats Monday as the only day off", () => {
    expect(isWorkingDay(d("2026-11-02"))).toBe(false); // Monday
    expect(isWorkingDay(d("2026-11-01"))).toBe(true); // Sunday
    expect(isWorkingDay(d("2026-11-03"))).toBe(true);
  });

  it("counts 5 working days over a Monday", () => {
    // Sat 7 Nov: Sun 8, (Mon 9 skipped), Tue 10, Wed 11, Thu 12, Fri 13
    expect(dateKey(addWorkingDays(d("2026-11-07"), 5))).toBe("2026-11-13");
  });

  it("starts counting after the class date, not on it", () => {
    expect(dateKey(addWorkingDays(d("2026-11-03"), 1))).toBe("2026-11-04");
    expect(dateKey(addWorkingDays(d("2026-11-03"), 0))).toBe("2026-11-03");
  });
});

describe("seatLimit", () => {
  it("prefers the batch's own limit, then the instrument's, else none", () => {
    expect(seatLimit({ maxStudents: 3 }, { maxStudents: 6 })).toBe(3);
    expect(seatLimit({ maxStudents: null }, { maxStudents: 6 })).toBe(6);
    expect(seatLimit({ maxStudents: null }, { maxStudents: null })).toBeNull();
  });
});

const batch = (id: string, dayOfWeek: string, startTime: string, maxStudents: number | null = null): SlotBatch => ({
  id,
  dayOfWeek,
  startTime,
  endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:00`,
  maxStudents,
});

const base = {
  today: d("2026-11-03"), // Tuesday
  nowMinutes: 9 * 60,
  seatsTaken: () => 0,
  studentBusyOn: () => false,
};

describe("slotOptions", () => {
  const guitar = { canMoveDay: true, maxStudents: 6 };
  const batches = [batch("tue5", "TUE", "17:00"), batch("tue6", "TUE", "18:00"), batch("wed5", "WED", "17:00"), batch("sun11", "SUN", "11:00")];

  it("offers other times that day and later days for an instrument that can move day", () => {
    const opts = slotOptions({ ...base, course: guitar, batches, from: { batchId: "tue5", date: d("2026-11-03") } });
    expect(opts.map((o) => `${o.dateKey} ${o.batchId}`)).toEqual(["2026-11-03 tue6", "2026-11-04 wed5", "2026-11-08 sun11"]);
  });

  it("never offers the class being missed", () => {
    const opts = slotOptions({ ...base, course: guitar, batches, from: { batchId: "tue5", date: d("2026-11-03") } });
    expect(opts.some((o) => o.batchId === "tue5" && o.dateKey === "2026-11-03")).toBe(false);
  });

  it("only offers the same day for an instrument that cannot move day", () => {
    const opts = slotOptions({ ...base, course: { canMoveDay: false, maxStudents: 5 }, batches, from: { batchId: "tue5", date: d("2026-11-03") } });
    expect(opts.map((o) => o.batchId)).toEqual(["tue6"]);
  });

  it("offers the same weekday next week only inside the 5 working days", () => {
    // missed Tue 3 Nov; window ends Mon->skipped, Tue 3 + 5 working days = Mon 9 skipped -> Sun 8
    const opts = slotOptions({ ...base, course: guitar, batches: [...batches, batch("tue6b", "TUE", "19:00")], from: { batchId: "tue5", date: d("2026-11-03") } });
    expect(opts.every((o) => o.dateKey <= "2026-11-08")).toBe(true);
  });

  it("leaves out full slots, counting seats per date", () => {
    const opts = slotOptions({
      ...base,
      course: guitar,
      batches,
      from: { batchId: "tue5", date: d("2026-11-03") },
      seatsTaken: (id, date) => (id === "tue6" && dateKey(date) === "2026-11-03" ? 6 : 0),
    });
    expect(opts.some((o) => o.batchId === "tue6")).toBe(false);
  });

  it("reports seats left, and null when no limit is set", () => {
    const opts = slotOptions({
      ...base,
      course: { canMoveDay: true, maxStudents: null },
      batches: [batch("wed5", "WED", "17:00", 4)],
      from: { batchId: "tue5", date: d("2026-11-03") },
      seatsTaken: () => 3,
    });
    expect(opts[0].seatsLeft).toBe(1);
    const noLimit = slotOptions({ ...base, course: { canMoveDay: true, maxStudents: null }, batches: [batch("wed5", "WED", "17:00")], from: { batchId: "tue5", date: d("2026-11-03") } });
    expect(noLimit[0].seatsLeft).toBeNull();
  });

  it("skips slots that have already started today", () => {
    const opts = slotOptions({ ...base, nowMinutes: 17 * 60 + 30, course: guitar, batches, from: { batchId: "tue5", date: d("2026-11-03") } });
    expect(opts.some((o) => o.batchId === "tue6" && o.dateKey === "2026-11-03")).toBe(true); // 18:00 still ahead
    const later = slotOptions({ ...base, nowMinutes: 18 * 60, course: guitar, batches, from: { batchId: "tue5", date: d("2026-11-03") } });
    expect(later.some((o) => o.batchId === "tue6" && o.dateKey === "2026-11-03")).toBe(false);
  });

  it("skips days the student already has a class of that instrument", () => {
    const opts = slotOptions({ ...base, course: guitar, batches, from: { batchId: "tue5", date: d("2026-11-03") }, studentBusyOn: (date) => dateKey(date) === "2026-11-04" });
    expect(opts.some((o) => o.dateKey === "2026-11-04")).toBe(false);
  });

  it("offers nothing once the missed class is past for a same-day-only instrument", () => {
    const opts = slotOptions({ ...base, course: { canMoveDay: false, maxStudents: 5 }, batches, from: { batchId: "tue5", date: d("2026-11-03") }, today: d("2026-11-04") });
    expect(opts).toEqual([]);
  });

  it("never offers a Monday", () => {
    const opts = slotOptions({ ...base, course: guitar, batches: [...batches, batch("mon", "MON", "17:00")], from: { batchId: "sun11", date: d("2026-11-08") }, today: d("2026-11-08"), nowMinutes: 0 });
    expect(opts.some((o) => o.batchId === "mon")).toBe(false);
  });
});

describe("makeUpDeadline and changeOutcome", () => {
  const skip = { kind: "SKIP" as const, status: "BOOKED" as const, fromDate: d("2026-11-03"), toDate: null };
  const move = { kind: "MOVE" as const, status: "BOOKED" as const, fromDate: d("2026-11-03"), toDate: d("2026-11-05") };

  it("gives a day-movable instrument 5 working days and others only the day itself", () => {
    expect(dateKey(makeUpDeadline(true, d("2026-11-03")))).toBe("2026-11-08");
    expect(dateKey(makeUpDeadline(false, d("2026-11-03")))).toBe("2026-11-03");
  });

  it("keeps a skip owed until its deadline, then expires it", () => {
    expect(changeOutcome({ ...skip, canMoveDay: true }, d("2026-11-08"), false)).toBe("OWED");
    expect(changeOutcome({ ...skip, canMoveDay: true }, d("2026-11-10"), false)).toBe("EXPIRED");
    expect(changeOutcome({ ...skip, canMoveDay: false }, d("2026-11-03"), false)).toBe("OWED");
    expect(changeOutcome({ ...skip, canMoveDay: false }, d("2026-11-04"), false)).toBe("EXPIRED");
  });

  it("tracks a make-up from booked to attended or didn't come", () => {
    expect(changeOutcome({ ...move, canMoveDay: true }, d("2026-11-04"), false)).toBe("UPCOMING");
    expect(changeOutcome({ ...move, canMoveDay: true }, d("2026-11-05"), false)).toBe("UPCOMING"); // the day itself
    expect(changeOutcome({ ...move, canMoveDay: true }, d("2026-11-06"), false)).toBe("NO_SHOW");
    expect(changeOutcome({ ...move, canMoveDay: true }, d("2026-11-06"), true)).toBe("ATTENDED");
  });

  it("shows a cancelled booking as cancelled", () => {
    expect(changeOutcome({ ...move, status: "CANCELLED", canMoveDay: true }, d("2026-11-04"), false)).toBe("CANCELLED");
  });
});
