"use client";

import { useState } from "react";
import { Input, Select, Textarea } from "@/components/ui";
import { PLAN_LABELS, PLAN_CLASSES, PLAN_DAYS, addDays, type SubscriptionPlan } from "@/lib/subscription";

function parseDateOnly(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Expiry defaults to start date + the plan's fixed day count; CUSTOM has no
// formula, so it's left blank for the admin to set manually.
function computeExpiry(startDateStr: string | undefined, plan: SubscriptionPlan) {
  if (plan === "CUSTOM") return "";
  const start = startDateStr ? parseDateOnly(startDateStr) : new Date();
  return toInputDate(addDays(start, PLAN_DAYS[plan]));
}

export function SubscriptionFormFields({
  defaultStartDate,
  currentRemaining,
  hideStartDate,
  fieldPrefix = "",
}: {
  defaultStartDate?: string;
  /** Remaining classes on the subscription being renewed, or undefined if this is a brand new one. */
  currentRemaining?: number;
  /** Skip rendering the start-date field — use when the caller already renders its own (e.g. shared with an enrollment date). The action still reads a "startDate" field from the form, so the caller's own field covers it. */
  hideStartDate?: boolean;
  /** Prepended to every field's name — lets several instances of this form coexist in one submission (e.g. enrolling into batches across multiple instruments at once, one subscription block per instrument). */
  fieldPrefix?: string;
}) {
  const [plan, setPlan] = useState<SubscriptionPlan>("ONE_MONTH");
  const [customClasses, setCustomClasses] = useState(0);
  const [carryForward, setCarryForward] = useState(currentRemaining ?? 0);
  const [bonusClasses, setBonusClasses] = useState(0);
  const [endDate, setEndDate] = useState(() => computeExpiry(defaultStartDate, "ONE_MONTH"));

  const baseClasses = plan === "CUSTOM" ? customClasses : PLAN_CLASSES[plan];
  const totalClasses = baseClasses + carryForward + bonusClasses;
  const hasCarryForward = currentRemaining !== undefined && currentRemaining > 0;

  function handlePlanChange(newPlan: SubscriptionPlan) {
    setPlan(newPlan);
    setEndDate(computeExpiry(defaultStartDate, newPlan));
  }

  return (
    <div className="space-y-3">
      <Select label="Plan" name={`${fieldPrefix}plan`} value={plan} onChange={(e) => handlePlanChange(e.target.value as SubscriptionPlan)}>
        {(Object.keys(PLAN_LABELS) as SubscriptionPlan[]).map((p) => (
          <option key={p} value={p}>
            {PLAN_LABELS[p]}
            {p !== "CUSTOM" ? ` — ${PLAN_CLASSES[p]} classes` : ""}
          </option>
        ))}
      </Select>
      {plan === "CUSTOM" && (
        <Input
          label="Number of classes"
          name={`${fieldPrefix}baseClasses`}
          type="number"
          min="1"
          required
          value={customClasses || ""}
          onChange={(e) => setCustomClasses(Number(e.target.value) || 0)}
        />
      )}
      {!hideStartDate && <Input label="Start date" name={`${fieldPrefix}startDate`} type="date" defaultValue={defaultStartDate} />}
      <Input
        label="Expiry date"
        name={`${fieldPrefix}endDate`}
        type="date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        hint={plan === "CUSTOM" ? undefined : `Auto-filled: ${PLAN_DAYS[plan]} days from the start date — adjust if needed`}
      />

      {hasCarryForward && (
        <Input
          label="Carry forward classes"
          name={`${fieldPrefix}carryForwardClasses`}
          type="number"
          min="0"
          max={currentRemaining}
          value={carryForward}
          onChange={(e) => setCarryForward(Math.max(0, Math.min(currentRemaining ?? 0, Number(e.target.value) || 0)))}
          hint={`${currentRemaining} unused class${currentRemaining === 1 ? "" : "es"} on the current subscription`}
        />
      )}

      <Input
        label="Bonus classes"
        name={`${fieldPrefix}bonusClasses`}
        type="number"
        min="0"
        value={bonusClasses || ""}
        onChange={(e) => setBonusClasses(Number(e.target.value) || 0)}
        placeholder="0"
      />
      {bonusClasses > 0 && <Textarea label="Bonus reason" name={`${fieldPrefix}bonusReason`} placeholder="e.g. Diwali offer" />}

      <div className="rounded-md bg-indigo-50 border border-indigo-100 px-3 py-2 text-sm text-indigo-900">
        <span className="font-medium">{totalClasses} classes</span> total
        <span className="text-indigo-500">
          {" "}
          ({baseClasses} base{carryForward > 0 ? ` + ${carryForward} carried forward` : ""}
          {bonusClasses > 0 ? ` + ${bonusClasses} bonus` : ""})
        </span>
      </div>
    </div>
  );
}
