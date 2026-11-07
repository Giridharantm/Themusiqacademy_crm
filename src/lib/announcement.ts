// Announcements: one WhatsApp message per family number, about the academy as a
// whole (a festival closure, a new batch, a fee reminder…) rather than about one
// class on one date. The audience can be every active student, the students of
// chosen instruments, or the students of chosen classes on any day.
//
// A number that belongs to several students (siblings) or to a student with
// several classes is messaged ONCE. The approved "class_notice" template still
// names a student, an instrument and a date, so the message is written about the
// student whose next class comes soonest on that number.

export type AnnounceScope = { kind: "all" } | { kind: "courses"; courseIds: string[] } | { kind: "batches"; batchIds: string[] };

export type AnnounceSource = {
  studentId: string;
  studentName: string;
  batchId: string;
  courseName: string;
  dayOfWeek: string; // "TUE" … "SUN"
  startTime: string; // "17:00"
  phones: { phone: string; consented: boolean }[];
};

export type Family = {
  phone: string;
  // The student, class and date the message is written about.
  studentId: string;
  studentName: string;
  batchId: string;
  courseName: string;
  startTime: string;
  classDate: string; // "YYYY-MM-DD", the next time that class meets
  // Everyone in scope who shares this number (for the preview list).
  students: string[];
};

export type Audience = {
  families: Family[];
  // Numbers in scope that have not agreed to WhatsApp (and no other student of theirs reaches them).
  notAgreed: string[];
  // Students in scope with no usable phone number at all.
  noNumber: number;
};

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]; // matches Date.getUTCDay()

// The first date on or after `fromStr` ("YYYY-MM-DD") that falls on `dayOfWeek`.
export function nextClassDate(dayOfWeek: string, fromStr: string): string {
  const [y, m, d] = fromStr.split("-").map(Number);
  for (let i = 0; i < 7; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i));
    if (DAY_CODES[day.getUTCDay()] === dayOfWeek) return day.toISOString().slice(0, 10);
  }
  return fromStr;
}

// Works out who gets the announcement: one entry per number that has agreed to
// WhatsApp, written about that number's soonest class (ties: earlier start, then name).
export function familiesFromRows(rows: AnnounceSource[], todayStr: string): Audience {
  const best = new Map<string, Family>();
  const names = new Map<string, Set<string>>();
  const notAgreed = new Set<string>();
  const noNumber = new Set<string>();

  type Key = Pick<Family, "classDate" | "startTime" | "studentName">;
  const compare = (a: Key, b: Key) => a.classDate.localeCompare(b.classDate) || a.startTime.localeCompare(b.startTime) || a.studentName.localeCompare(b.studentName);

  for (const r of rows) {
    if (r.phones.length === 0) noNumber.add(r.studentId);
    const classDate = nextClassDate(r.dayOfWeek, todayStr);
    for (const { phone, consented } of r.phones) {
      if (!consented) {
        notAgreed.add(phone);
        continue;
      }
      if (!names.has(phone)) names.set(phone, new Set());
      names.get(phone)!.add(r.studentName);
      const candidate: Family = { phone, studentId: r.studentId, studentName: r.studentName, batchId: r.batchId, courseName: r.courseName, startTime: r.startTime, classDate, students: [] };
      const current = best.get(phone);
      if (!current || compare(candidate, current) < 0) best.set(phone, candidate);
    }
  }

  const families = Array.from(best.values())
    .map((f) => ({ ...f, students: Array.from(names.get(f.phone)!).sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.studentName.localeCompare(b.studentName) || a.phone.localeCompare(b.phone));
  return { families, notAgreed: Array.from(notAgreed).filter((p) => !best.has(p)), noNumber: noNumber.size };
}

type ScopeInput = { audience?: string; courseId?: string | string[]; batchId?: string | string[] };
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

// The audience chosen on the form (or carried in the URL): everyone unless the
// form says instruments or classes. Choosing instruments/classes with none
// ticked gives an empty list, never "everyone".
export function parseScope(input: ScopeInput): AnnounceScope {
  if (input.audience === "courses") return { kind: "courses", courseIds: list(input.courseId) };
  if (input.audience === "batches") return { kind: "batches", batchIds: list(input.batchId) };
  return { kind: "all" };
}
