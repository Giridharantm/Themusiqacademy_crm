export const DAY_LABELS: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

export const OPERATING_DAYS = ["TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const DAY_CODES_BY_JS_INDEX = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]; // matches Date.getDay()

// Which day-of-week code a calendar date falls on — used to scope an
// attendance roster to students actually scheduled that day (e.g. a Tue/Thu
// Guitar student shouldn't default into a Wednesday Guitar roster).
export function dayCodeFromDate(date: Date): string {
  return DAY_CODES_BY_JS_INDEX[date.getDay()];
}

const DAY_ORDER: Record<string, number> = Object.fromEntries(OPERATING_DAYS.map((d, i) => [d, i]));

// Sort batches by instrument, then day (Tue..Sun), then start time — so a
// batch picker reads as a natural weekly schedule rather than insertion order.
export function sortBatches<T extends { course: { name: string }; dayOfWeek: string; startTime: string }>(batches: T[]): T[] {
  return [...batches].sort((a, b) => {
    const courseCompare = a.course.name.localeCompare(b.course.name);
    if (courseCompare !== 0) return courseCompare;
    const dayCompare = (DAY_ORDER[a.dayOfWeek] ?? 99) - (DAY_ORDER[b.dayOfWeek] ?? 99);
    if (dayCompare !== 0) return dayCompare;
    return a.startTime.localeCompare(b.startTime);
  });
}

// Each batch is a fixed 1-hour slot. Monday is a holiday.
function operatingWindow(day: string): { openHour: number; closeHour: number } | null {
  if (day === "MON") return null;
  if (day === "SAT") return { openHour: 14, closeHour: 20 }; // 2pm - 8pm
  if (day === "SUN") return { openHour: 11, closeHour: 17 }; // 11am - 5pm
  return { openHour: 15, closeHour: 21 }; // Tue-Fri, 3pm - 9pm
}

function formatHour(hour: number) {
  const h = hour % 24;
  const period = h < 12 || h === 24 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

// "15:00" -> "3:00 PM"
export function formatTimeLabel(time: string) {
  const hour = Number(time.split(":")[0]);
  return formatHour(hour);
}

export function timeSlotsForDay(day: string): { start: string; end: string; label: string }[] {
  const window = operatingWindow(day);
  if (!window) return [];
  const slots = [];
  for (let hour = window.openHour; hour < window.closeHour; hour++) {
    const start = `${String(hour).padStart(2, "0")}:00`;
    const end = `${String(hour + 1).padStart(2, "0")}:00`;
    slots.push({ start, end, label: `${formatHour(hour)} - ${formatHour(hour + 1)}` });
  }
  return slots;
}

