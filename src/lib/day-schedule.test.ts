import { describe, it, expect } from "vitest";
import { buildDaySchedule, type DayBatch, type DayChange } from "./day-schedule";

const batch = (id: string, courseName: string, startTime: string, over: Partial<DayBatch> = {}): DayBatch => ({
  id,
  courseId: `course-${courseName}`,
  courseName,
  startTime,
  endTime: `${Number(startTime.slice(0, 2)) + 1}:00`,
  teacherName: "Teacher",
  maxStudents: null,
  courseMaxStudents: 6,
  ...over,
});

const enrolled = [
  { batchId: "g5", studentId: "asha", studentName: "Asha" },
  { batchId: "g5", studentId: "ben", studentName: "Ben" },
  { batchId: "g6", studentId: "cara", studentName: "Cara" },
];

const move: DayChange = { studentId: "ben", studentName: "Ben", fromBatchId: "g5", fromDateKey: "2026-11-03", toBatchId: "g6", toDateKey: "2026-11-03", toLabel: "Tue 3 Nov 6:00 PM" };

describe("buildDaySchedule", () => {
  const batches = [batch("g6", "Guitar", "18:00"), batch("g5", "Guitar", "17:00"), batch("d5", "Drums", "17:00", { courseMaxStudents: 4 })];

  it("lists the permanent roster by slot, in time order", () => {
    const slots = buildDaySchedule({ dateKey: "2026-11-03", batches, enrollments: enrolled, changes: [], presentKeys: new Set() });
    expect(slots.map((s) => `${s.batch.startTime} ${s.batch.courseName}: ${s.students.map((x) => x.name).join(",")}`)).toEqual([
      "17:00 Drums: ",
      "17:00 Guitar: Asha,Ben",
      "18:00 Guitar: Cara",
    ]);
  });

  it("moves a student out of their regular slot and into the make-up slot for that date only", () => {
    const slots = buildDaySchedule({ dateKey: "2026-11-03", batches, enrollments: enrolled, changes: [move], presentKeys: new Set() });
    const five = slots.find((s) => s.batch.id === "g5")!;
    const six = slots.find((s) => s.batch.id === "g6")!;
    expect(five.students.map((s) => s.name)).toEqual(["Asha"]);
    expect(five.away).toEqual([{ id: "ben", name: "Ben", detail: "moved to Tue 3 Nov 6:00 PM" }]);
    expect(six.students.map((s) => `${s.name}${s.makeUp ? " (make-up)" : ""}`)).toEqual(["Ben (make-up)", "Cara"]);
    expect(six.taken).toBe(2);
  });

  it("leaves other days alone", () => {
    const slots = buildDaySchedule({ dateKey: "2026-11-10", batches, enrollments: enrolled, changes: [move], presentKeys: new Set() });
    expect(slots.find((s) => s.batch.id === "g5")!.students).toHaveLength(2);
    expect(slots.every((s) => s.away.length === 0)).toBe(true);
  });

  it("shows a skip with no new slot as not coming", () => {
    const skip: DayChange = { ...move, toBatchId: null, toDateKey: null, toLabel: null };
    const five = buildDaySchedule({ dateKey: "2026-11-03", batches, enrollments: enrolled, changes: [skip], presentKeys: new Set() }).find((s) => s.batch.id === "g5")!;
    expect(five.away).toEqual([{ id: "ben", name: "Ben", detail: "not coming" }]);
    expect(five.students.map((s) => s.name)).toEqual(["Asha"]);
  });

  it("marks who is already present and reports seats against the limit", () => {
    const slots = buildDaySchedule({ dateKey: "2026-11-03", batches, enrollments: enrolled, changes: [], presentKeys: new Set(["asha|course-Guitar"]) });
    const five = slots.find((s) => s.batch.id === "g5")!;
    expect(five.students.map((s) => s.present)).toEqual([true, false]);
    expect(five.taken).toBe(2);
    expect(five.limit).toBe(6);
    expect(slots.find((s) => s.batch.id === "d5")!.limit).toBe(4);
  });

  it("prefers the class's own limit over the instrument's", () => {
    const slots = buildDaySchedule({ dateKey: "2026-11-03", batches: [batch("g5", "Guitar", "17:00", { maxStudents: 3 })], enrollments: enrolled, changes: [], presentKeys: new Set() });
    expect(slots[0].limit).toBe(3);
  });
});
