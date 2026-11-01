// The day's real timetable: who is actually expected in each slot on a given
// date — the permanent roster, less students skipping or moved away that day,
// plus students coming for a make-up. Pure; the page does the queries.
import { seatLimit } from "@/lib/reschedule";

export type DayBatch = {
  id: string;
  courseId: string;
  courseName: string;
  startTime: string;
  endTime: string;
  teacherName: string | null;
  maxStudents: number | null;
  courseMaxStudents: number | null;
};

export type DayChange = {
  studentId: string;
  studentName: string;
  fromBatchId: string;
  fromDateKey: string;
  toBatchId: string | null;
  toDateKey: string | null;
  toLabel: string | null; // e.g. "Wed 4 Nov 6:00 PM", for the "moved to" note
};

export type DaySlotStudent = { id: string; name: string; present: boolean; makeUp: boolean };
export type DaySlotAway = { id: string; name: string; detail: string };

export type DaySlot = {
  batch: DayBatch;
  students: DaySlotStudent[]; // expected today, in name order
  away: DaySlotAway[]; // regular students not coming today
  taken: number;
  limit: number | null;
};

export function buildDaySchedule(input: {
  dateKey: string;
  batches: DayBatch[];
  enrollments: { batchId: string; studentId: string; studentName: string }[];
  changes: DayChange[];
  presentKeys: Set<string>; // `${studentId}|${courseId}` marked present today
}): DaySlot[] {
  const { dateKey, changes } = input;
  const away = changes.filter((c) => c.fromDateKey === dateKey);
  const coming = changes.filter((c) => c.toBatchId && c.toDateKey === dateKey);

  return input.batches
    .map((batch) => {
      const awayHere = away.filter((c) => c.fromBatchId === batch.id);
      const awayIds = new Set(awayHere.map((c) => c.studentId));
      const present = (studentId: string) => input.presentKeys.has(`${studentId}|${batch.courseId}`);

      const students: DaySlotStudent[] = [
        ...input.enrollments
          .filter((e) => e.batchId === batch.id && !awayIds.has(e.studentId))
          .map((e) => ({ id: e.studentId, name: e.studentName, present: present(e.studentId), makeUp: false })),
        ...coming
          .filter((c) => c.toBatchId === batch.id)
          .map((c) => ({ id: c.studentId, name: c.studentName, present: present(c.studentId), makeUp: true })),
      ].sort((a, b) => a.name.localeCompare(b.name));

      return {
        batch,
        students,
        away: awayHere.map((c) => ({ id: c.studentId, name: c.studentName, detail: c.toBatchId && c.toLabel ? `moved to ${c.toLabel}` : "not coming" })),
        taken: students.length,
        limit: seatLimit({ maxStudents: batch.maxStudents }, { maxStudents: batch.courseMaxStudents }),
      };
    })
    .sort((a, b) => a.batch.startTime.localeCompare(b.batch.startTime) || a.batch.courseName.localeCompare(b.batch.courseName));
}
