// What a family's WhatsApp taps mean. The reminder's buttons and the slot list
// carry a short id naming the student, the class being missed and its date, so
// a tap needs no guessing about who it is for. Pure: no database or network.
import { clockLabel, shortDateLabel } from "@/lib/whatsapp-notices";
import type { SlotOption } from "@/lib/reschedule";

export type ClassReply =
  | { kind: "yes"; studentId: string; batchId: string; date: string } // "Yes, I'll attend" on the reminder
  | { kind: "no"; studentId: string; batchId: string; date: string } // "No, can't attend" on the reminder
  | { kind: "cyes"; studentId: string; batchId: string; date: string } // "Yes, I'll attend" on a comp class message (batchId: the regular batch it makes up for)
  | { kind: "cno"; studentId: string; batchId: string; date: string } // "No, can't attend" on a comp class message
  | { kind: "move"; studentId: string; batchId: string; date: string } // "Reschedule", asked after a No
  | { kind: "cancel"; studentId: string; batchId: string; date: string } // "Cancel class", asked after a No
  | { kind: "slot"; studentId: string; batchId: string; date: string; toBatchId: string; toDate: string } // a row chosen from the list
  | { kind: "nomove"; studentId: string; batchId: string; date: string }; // "No slot now" row

export function replyId(r: ClassReply): string {
  const base = [r.kind, r.studentId, r.batchId, r.date];
  return (r.kind === "slot" ? [...base, r.toBatchId, r.toDate] : base).join("|");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseReplyId(id: string): ClassReply | null {
  const [kind, studentId, batchId, date, toBatchId, toDate] = id.split("|");
  if (!studentId || !batchId || !DATE.test(date ?? "")) return null;
  if (kind === "yes" || kind === "no" || kind === "cyes" || kind === "cno" || kind === "move" || kind === "cancel" || kind === "nomove") return { kind, studentId, batchId, date };
  if (kind === "slot" && toBatchId && DATE.test(toDate ?? "")) return { kind, studentId, batchId, date, toBatchId, toDate };
  return null;
}

// WhatsApp's list message takes at most 10 rows; the last is always a way out.
export const MAX_SLOT_ROWS = 9;

export type ListRow = { id: string; title: string; description?: string };

// Row titles are capped at 24 characters: "Tue 3 Nov · 6:00 PM".
export function slotRows(from: { studentId: string; batchId: string; date: string }, options: SlotOption[], courseName: string): ListRow[] {
  const rows: ListRow[] = options.slice(0, MAX_SLOT_ROWS).map((o) => ({
    id: replyId({ kind: "slot", ...from, toBatchId: o.batchId, toDate: o.dateKey }),
    title: `${shortDateLabel(o.date)} · ${clockLabel(o.startTime)}`,
    description: `${courseName} make-up class`,
  }));
  rows.push({ id: replyId({ kind: "nomove", ...from }), title: "None of these suit me" });
  return rows;
}

export type InteractiveButtonsRequest = {
  messaging_product: "whatsapp";
  to: string;
  type: "interactive";
  interactive: {
    type: "button";
    body: { text: string };
    action: { buttons: { type: "reply"; reply: { id: string; title: string } }[] };
  };
};

// Up to 3 tap buttons; titles are capped at 20 characters.
export function buttonsRequest(to: string, body: string, buttons: { id: string; title: string }[]): InteractiveButtonsRequest {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: { type: "button", body: { text: body.slice(0, 1024) }, action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) } },
  };
}

export type InteractiveListRequest = {
  messaging_product: "whatsapp";
  to: string;
  type: "interactive";
  interactive: {
    type: "list";
    body: { text: string };
    action: { button: string; sections: { title: string; rows: ListRow[] }[] };
  };
};

export function listRequest(to: string, body: string, rows: ListRow[]): InteractiveListRequest {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: { type: "list", body: { text: body.slice(0, 1024) }, action: { button: "Choose a slot", sections: [{ title: "Available slots", rows }] } },
  };
}

// ---- the words we send back ------------------------------------------------

export const ACADEMY_PHONE_LABEL = "+91 70901 30000";

export const callUsText = (what: string) => `${what} We couldn't find a free make-up slot in the next few days. Please call us on ${ACADEMY_PHONE_LABEL} and we'll arrange one.`;

export function slotsBody(studentName: string, courseName: string, missed: { date: Date; startTime: string }) {
  return `Choose a make-up slot for ${studentName}'s ${courseName} class on ${shortDateLabel(missed.date)} at ${clockLabel(missed.startTime)}. Make-ups are available the same day or within 5 working days.`;
}

export function confirmedText(studentName: string, courseName: string, slot: { date: Date; startTime: string }) {
  return `Confirmed! ${studentName}'s ${courseName} class is booked for ${shortDateLabel(slot.date)} at ${clockLabel(slot.startTime)}. See you then! - The Musiq Academy`;
}

export function attendingText(studentName: string, startTime: string) {
  return `Great, see you at ${clockLabel(startTime)}! Have a lovely class. - The Musiq Academy`;
}

export function compAttendingText(startTime: string | null) {
  return `Great, see you ${startTime ? `at ${clockLabel(startTime)}` : "then"} for the comp class! - The Musiq Academy`;
}

export const compDeclinedText = (studentName: string) =>
  `Noted: ${studentName} won't be at the comp class. Thank you for letting us know. - The Musiq Academy`;

export const REPLY_BUTTON_RESCHEDULE = "Reschedule";
export const REPLY_BUTTON_CANCEL = "Cancel the class";

export function whatNextText(studentName: string, courseName: string, startTime: string) {
  return `Sorry to hear that. What would you like to do about ${studentName}'s ${courseName} class today at ${clockLabel(startTime)}?`;
}

export function skippedText(studentName: string, courseName: string, missed: { date: Date; startTime: string }) {
  return `Noted: ${studentName} will miss the ${courseName} class on ${shortDateLabel(missed.date)} at ${clockLabel(missed.startTime)}.`;
}
