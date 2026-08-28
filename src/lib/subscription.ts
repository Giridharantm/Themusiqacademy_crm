export type SubscriptionPlan = "ONE_MONTH" | "THREE_MONTHS" | "SIX_MONTHS" | "ONE_YEAR" | "CUSTOM";

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  ONE_MONTH: "1 Month",
  THREE_MONTHS: "3 Months",
  SIX_MONTHS: "6 Months",
  ONE_YEAR: "1 Year",
  CUSTOM: "Custom",
};

// Base package sizes: roughly 2 classes/week.
export const PLAN_CLASSES: Record<SubscriptionPlan, number> = {
  ONE_MONTH: 8,
  THREE_MONTHS: 24,
  SIX_MONTHS: 48,
  ONE_YEAR: 96,
  CUSTOM: 0,
};

// Expiry is start date + a fixed day count per plan (not calendar months) —
// 40 days per plan-month, giving a grace window beyond the nominal duration
// for holidays/reschedules. Pre-fills the "Expiry date" field; CUSTOM has no
// formula since its duration is fully manual.
export const PLAN_DAYS: Record<SubscriptionPlan, number> = {
  ONE_MONTH: 40,
  THREE_MONTHS: 120,
  SIX_MONTHS: 240,
  ONE_YEAR: 480,
  CUSTOM: 0,
};

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Invoice price per plan duration — one price list across every instrument,
// not per-course. CUSTOM has no fixed invoice price since its duration is
// set manually, so invoice line items only ever offer these four.
export const PLAN_INVOICE_AMOUNTS: Record<Exclude<SubscriptionPlan, "CUSTOM">, number> = {
  ONE_MONTH: 4800,
  THREE_MONTHS: 13680,
  SIX_MONTHS: 25920,
  ONE_YEAR: 40320,
};

// Allowed invoice discount amounts (Rs.) — Rs. 500 steps up to Rs. 10,000.
export const DISCOUNT_STEPS = Array.from({ length: 20 }, (_, i) => (i + 1) * 500);

// Only classes the student actually attended (PRESENT) draw down the
// package — an ABSENT class isn't consumed, so the student is still owed it.
export function countUsedClasses(attendance: { status: string }[]) {
  return attendance.filter((a) => a.status === "PRESENT").length;
}

export function subscriptionTotals(subscription: {
  baseClasses: number;
  carryForwardClasses: number;
  status: string;
  classesUsedAtClose: number | null;
  classesUsedAtMigration: number;
  bonusGrants: { classes: number }[];
}, liveUsedIfActive: number) {
  const bonusClasses = subscription.bonusGrants.reduce((sum, g) => sum + g.classes, 0);
  const totalClasses = subscription.baseClasses + subscription.carryForwardClasses + bonusClasses;
  const used =
    subscription.status === "ACTIVE"
      ? subscription.classesUsedAtMigration + liveUsedIfActive
      : subscription.classesUsedAtClose ?? 0;
  const remaining = totalClasses - used;
  return { bonusClasses, totalClasses, used, remaining };
}

export function renewalUrgency(remaining: number): "ok" | "soon" | "due" {
  if (remaining <= 0) return "due";
  if (remaining <= 2) return "soon";
  return "ok";
}

// A subscription is pooled per (student, course) — attendance is fetched
// directly by studentId + the course's batches (not via Enrollment), so a
// comp/reschedule class in a different batch of the same instrument still
// counts. This just scopes that already-fetched list to classes held since
// the subscription started.
export function attendanceForSubscription<T extends { status: string; date: Date }>(
  subscriptionStartDate: Date,
  attendance: T[]
): T[] {
  return attendance.filter((a) => a.date >= subscriptionStartDate);
}
