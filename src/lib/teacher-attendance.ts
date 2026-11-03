// A teacher's own attendance: admin / front desk mark it, the teacher reads it.
// Pure so the rules (what a valid entry is, how a month adds up) are testable.

export type TeacherAttendanceStatus = "PRESENT" | "ABSENT";

export const TEACHER_ATTENDANCE_LABELS: Record<TeacherAttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
};

export const NOTE_MAX_LENGTH = 500;

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const isClockTime = (s: string) => CLOCK_TIME.test(s);

// "14:05" -> "2:05 PM", matching how class times are shown elsewhere.
export function clockLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export type EntryInput = { date: string; status: string; time: string; note: string };
export type Entry = { date: string; status: TeacherAttendanceStatus; time: string | null; note: string | null };

// Checks what the form sent. A present teacher needs the time they came in; an
// absent one doesn't (the time is dropped so a stale value can't linger). Days
// that haven't happened yet can't be marked.
export function parseEntry(input: EntryInput, today: string): { ok: true; entry: Entry } | { ok: false; error: string } {
  const date = input.date.trim();
  if (!DATE_ONLY.test(date)) return { ok: false, error: "Pick a date" };
  if (date > today) return { ok: false, error: "Attendance can't be marked for a future day" };
  if (input.status !== "PRESENT" && input.status !== "ABSENT") return { ok: false, error: "Choose present or absent" };

  const time = input.time.trim();
  if (input.status === "PRESENT") {
    if (!time) return { ok: false, error: "Enter the time the teacher came in" };
    if (!isClockTime(time)) return { ok: false, error: "Enter the time as hours and minutes" };
  } else if (time && !isClockTime(time)) {
    return { ok: false, error: "Enter the time as hours and minutes" };
  }

  const note = input.note.trim();
  if (note.length > NOTE_MAX_LENGTH) return { ok: false, error: `Notes can be up to ${NOTE_MAX_LENGTH} characters` };

  return { ok: true, entry: { date, status: input.status, time: input.status === "PRESENT" ? time : null, note: note || null } };
}

export function summarise(entries: { status: TeacherAttendanceStatus }[]) {
  const present = entries.filter((e) => e.status === "PRESENT").length;
  return { present, absent: entries.length - present, marked: entries.length };
}

// First day of the month and of the next, as yyyy-mm-dd, for a "yyyy-mm" value;
// null when it isn't one.
export function monthBounds(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}
