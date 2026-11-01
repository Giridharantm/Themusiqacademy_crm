import { OPERATING_DAYS, dayCodeFromDate } from "@/lib/schedule";

// A missed class can be made up the same day or within this many working
// days (Monday is the holiday, so it never counts) of the class date.
export const COMP_WORKING_DAYS = 5;

export function isWorkingDay(date: Date): boolean {
  return OPERATING_DAYS.includes(dayCodeFromDate(date));
}

// yyyy-mm-dd of the date as the server sees it — the same date-only
// convention attendance uses (see parseDateOnly in attendance.ts).
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysTo(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// The date `count` working days after `from` (from itself isn't counted).
export function addWorkingDays(from: Date, count: number): Date {
  let date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let left = count;
  while (left > 0) {
    date = addDaysTo(date, 1);
    if (isWorkingDay(date)) left--;
  }
  return date;
}

// A batch's own limit wins over its instrument's; null means no limit.
export function seatLimit(batch: { maxStudents: number | null }, course: { maxStudents: number | null }): number | null {
  return batch.maxStudents ?? course.maxStudents ?? null;
}

export type SlotBatch = { id: string; dayOfWeek: string; startTime: string; endTime: string; maxStudents: number | null };

export type SlotOption = {
  batchId: string;
  date: Date;
  dateKey: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  seatsLeft: number | null; // null = no limit set
};

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Every slot a missed class (fromBatch on fromDate) may be made up in: today
// or later, the same day or within COMP_WORKING_DAYS working days of the
// missed class. An instrument that can't move day only gets other times on
// the same day. Full slots, slots already started, the class being missed, and
// days the student already has a class of this instrument are left out.
export function slotOptions(input: {
  course: { canMoveDay: boolean; maxStudents: number | null };
  batches: SlotBatch[];
  from: { batchId: string; date: Date };
  today: Date;
  nowMinutes: number;
  seatsTaken: (batchId: string, date: Date) => number;
  studentBusyOn: (date: Date) => boolean;
}): SlotOption[] {
  const { course, batches, from, today, nowMinutes } = input;
  const fromKey = dateKey(from.date);
  const last = course.canMoveDay ? addWorkingDays(from.date, COMP_WORKING_DAYS) : from.date;
  const options: SlotOption[] = [];

  for (let date = new Date(today.getFullYear(), today.getMonth(), today.getDate()); date <= last; date = addDaysTo(date, 1)) {
    if (!isWorkingDay(date)) continue;
    const key = dateKey(date);
    if (!course.canMoveDay && key !== fromKey) continue;
    if (input.studentBusyOn(date)) continue;
    const day = dayCodeFromDate(date);

    for (const batch of batches) {
      if (batch.dayOfWeek !== day) continue;
      if (batch.id === from.batchId && key === fromKey) continue;
      if (key === dateKey(today) && minutesOf(batch.startTime) <= nowMinutes) continue;
      const limit = seatLimit(batch, course);
      const seatsLeft = limit === null ? null : limit - input.seatsTaken(batch.id, date);
      if (seatsLeft !== null && seatsLeft <= 0) continue;
      options.push({ batchId: batch.id, date, dateKey: key, dayOfWeek: batch.dayOfWeek, startTime: batch.startTime, endTime: batch.endTime, seatsLeft });
    }
  }

  return options.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startTime.localeCompare(b.startTime));
}
