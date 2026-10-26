// Pure logic for WhatsApp class reminders and ad hoc notices: which kinds of
// notice exist, who a message goes to, and the exact template payloads. Kept
// free of Next/Prisma imports so it can be unit-tested; the DB side lives in
// whatsapp-service.ts and the HTTP call in whatsapp-send.ts.
import { format } from "date-fns";
import { normalizeIndianPhone } from "@/lib/trial-request";

// Template names as approved in Meta's WhatsApp Manager. All are UTILITY
// templates in English; their exact wording is documented in the README.
export const TEMPLATE_REMINDER = "class_reminder"; // {{1}} student, {{2}} instrument, {{3}} time — for a student with no current subscription
export const TEMPLATE_REMINDER_PROGRESS = "class_reminder_progress"; // same, plus {{4}} classes completed, {{5}} classes in the current subscription
export const TEMPLATE_RESCHEDULED = "class_rescheduled"; // {{1}} student, {{2}} instrument, {{3}} old slot, {{4}} new slot
export const TEMPLATE_NOTICE = "class_notice"; // {{1}} student, {{2}} instrument, {{3}} date, {{4}} message

export type NoticeTypeKey = "TEACHER_LEAVE" | "TEACHER_LATE" | "RESCHEDULE" | "CLASS_CANCELLED" | "ACADEMY_LEAVE" | "OTHER";

export const NOTICE_TYPES: Record<
  NoticeTypeKey,
  {
    label: string;
    // A class that is cancelled or moved must not also get the usual
    // "your class is today" reminder, so a sent notice of these types
    // silences that day's reminder for the classes it covers.
    suppressesReminder: boolean;
    defaultMessage: string;
  }
> = {
  TEACHER_LEAVE: {
    label: "Teacher on leave",
    suppressesReminder: true,
    defaultMessage: "Your teacher is on leave, so this class will not run. We will let you know about a make-up class soon.",
  },
  TEACHER_LATE: {
    label: "Teacher running late",
    suppressesReminder: false,
    defaultMessage: "Your teacher will be about 15 minutes late. The class will start a little later than usual.",
  },
  RESCHEDULE: {
    label: "Reschedule a class",
    suppressesReminder: true,
    defaultMessage: "",
  },
  CLASS_CANCELLED: {
    label: "Class cancelled",
    suppressesReminder: true,
    defaultMessage: "This class has been cancelled. We will let you know about a make-up class soon.",
  },
  ACADEMY_LEAVE: {
    label: "Academy closed",
    suppressesReminder: true,
    defaultMessage: "The academy will be closed on this day, so there will be no class. Classes resume on the next working day.",
  },
  OTHER: {
    label: "Other update",
    suppressesReminder: false,
    defaultMessage: "",
  },
};

export const NOTICE_TYPE_KEYS = Object.keys(NOTICE_TYPES) as NoticeTypeKey[];

export const isNoticeType = (v: string): v is NoticeTypeKey => v in NOTICE_TYPES;

// Today's date in India as "YYYY-MM-DD", whatever time zone the server runs in
// — the reminder job is scheduled for 10:00 IST, and "today's classes" means
// the date on the wall clock at the academy.
export function istDateString(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// "Tue 27 Oct" for a date-only value.
export function shortDateLabel(date: Date): string {
  return format(date, "EEE d MMM");
}

// "17:00" -> "5:00 PM" (keeps the minutes, unlike formatTimeLabel, so a
// rescheduled "17:30" is not shown as "5:00 PM").
export function clockLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}

// WhatsApp rejects template parameters that contain newlines, tabs or runs
// of 4+ spaces, or that are empty.
export function sanitizeParam(text: string): string {
  const clean = text.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 1000);
  return clean || "-";
}

// How a phone number is stored in the CRM: Indian numbers as the bare 10
// digits, foreign ones as "+<digits>".
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const indian = normalizeIndianPhone(raw);
  if (indian) return indian;
  const digits = raw.replace(/\D/g, "");
  return raw.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

// The number format WhatsApp's API wants: country code, digits only.
export function waNumber(phone: string): string {
  return phone.startsWith("+") ? phone.slice(1) : `91${phone}`;
}

// A student's messages go to their parent/guardian number(s) when any are on
// file, otherwise to the student's own number. De-duplicated, normalized,
// invalid numbers dropped.
export function recipientPhones(guardianPhones: (string | null | undefined)[], studentPhone: string | null | undefined): string[] {
  const guardians = guardianPhones.map(normalizePhone).filter((p): p is string => !!p);
  const chosen = guardians.length > 0 ? guardians : [normalizePhone(studentPhone)].filter((p): p is string => !!p);
  return Array.from(new Set(chosen));
}

export type TemplateRequest = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components: { type: "body"; parameters: { type: "text"; text: string }[] }[];
  };
};

export function templateRequest(phone: string, name: string, params: string[]): TemplateRequest {
  return {
    messaging_product: "whatsapp",
    to: waNumber(phone),
    type: "template",
    template: {
      name,
      language: { code: "en" },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: sanitizeParam(text) })) }],
    },
  };
}

// Keywords a customer can send to stop, or restart, our WhatsApp messages.
// Exact, whole-message matches only, so "please don't stop the classes" can
// never switch someone off.
export const isStopMessage = (text: string) => /^\s*(stop|stop all|unsubscribe|opt out)\s*[.!]*\s*$/i.test(text);
export const isStartMessage = (text: string) => /^\s*(start|subscribe|opt in)\s*[.!]*\s*$/i.test(text);

// The exact wording of each template, as submitted to Meta for approval. The
// admin preview renders these so staff see what a family will receive.
export const TEMPLATE_BODIES: Record<string, string> = {
  [TEMPLATE_REMINDER]: "Hello! A reminder from The Musiq Academy: {{1}}'s {{2}} class is today at {{3}}. See you at the academy!",
  [TEMPLATE_REMINDER_PROGRESS]:
    "Hello! A reminder from The Musiq Academy: {{1}}'s {{2}} class is today at {{3}}. Classes completed so far: {{4}} of {{5}}. See you at the academy!",
  [TEMPLATE_RESCHEDULED]:
    "Hello! An update from The Musiq Academy: {{1}}'s {{2}} class on {{3}} has been rescheduled to {{4}}. Please reply here if this time doesn't work.",
  [TEMPLATE_NOTICE]:
    "Hello! An update from The Musiq Academy about {{1}}'s {{2}} class on {{3}}: {{4}} Please reply here if you have any questions.",
};

export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => sanitizeParam(params[Number(n) - 1] ?? ""));
}

export type ClassProgress = { used: number; total: number };

// The 10 AM reminder for one student's class. A student with a current
// subscription also hears how many of its classes they have completed
// (e.g. 13 of 28); one without gets the plain reminder.
export function reminderMessage(
  r: { studentName: string; courseName: string; startTime: string },
  progress: ClassProgress | null
): { template: string; params: string[] } {
  const base = [r.studentName, r.courseName, clockLabel(r.startTime)];
  if (!progress || progress.total <= 0) return { template: TEMPLATE_REMINDER, params: base };
  return { template: TEMPLATE_REMINDER_PROGRESS, params: [...base, String(Math.max(0, progress.used)), String(progress.total)] };
}

// "27 Oct, 4:41 pm" in India time, whatever time zone the server runs in.
export function istLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(date);
}

// ---- who a daily reminder goes to ----------------------------------------

export type ReminderDecision = "SEND" | "CLASS_NOTICE" | "STUDENT_OFF" | "SKIPPED" | "NO_PHONE" | "NO_CONSENT";

// The one place that decides whether a student's reminder for a class goes
// out — used both by the 10 AM job and by the Reminders page, so what staff
// see there is exactly what will be sent. First matching reason wins.
export function reminderDecision(i: {
  classHasNotice: boolean; // a sent cancel/reschedule/leave notice already covers this class today
  studentOff: boolean; // reminders turned off for this student
  skippedToday: boolean; // skipped for this date only
  phone: string | null;
  consented: boolean;
}): ReminderDecision {
  if (i.classHasNotice) return "CLASS_NOTICE";
  if (i.studentOff) return "STUDENT_OFF";
  if (i.skippedToday) return "SKIPPED";
  if (!i.phone) return "NO_PHONE";
  if (!i.consented) return "NO_CONSENT";
  return "SEND";
}

export const DECISION_LABELS: Record<ReminderDecision, string> = {
  SEND: "Will be sent",
  CLASS_NOTICE: "Class cancelled or moved by a notice",
  STUDENT_OFF: "Reminders turned off for this student",
  SKIPPED: "Skipped for this day",
  NO_PHONE: "No valid phone number",
  NO_CONSENT: "Hasn't agreed to WhatsApp",
};

const REMINDER_HOUR_IST = 10;
const OPERATING_WEEKDAYS = new Set([2, 3, 4, 5, 6, 0]); // Tue–Sun (JS getDay); Monday is the holiday

// The date ("YYYY-MM-DD") of the next reminder run that hasn't happened yet:
// today before 10:00 IST, otherwise the next day — skipping Monday.
export function nextReminderDateStr(now: Date): string {
  const hourIst = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(now)) % 24;
  const [y, m, d] = istDateString(now).split("-").map(Number);
  let day = new Date(Date.UTC(y, m - 1, d));
  if (hourIst >= REMINDER_HOUR_IST) day = new Date(day.getTime() + 86_400_000);
  while (!OPERATING_WEEKDAYS.has(day.getUTCDay())) day = new Date(day.getTime() + 86_400_000);
  return day.toISOString().slice(0, 10);
}
