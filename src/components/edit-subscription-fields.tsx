"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui";
import { PLAN_LABELS, PLAN_CLASSES, type SubscriptionPlan } from "@/lib/subscription";

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Direct correction of an already-active subscription's own fields — a typo
// in the start date, the wrong plan picked, a carry-forward number that
// needs fixing. No total-classes preview or bonus section here since this
// isn't a renewal: bonus classes have their own "+ Add bonus classes" flow,
// and there's no "old subscription" to carry forward from.
export function EditSubscriptionFields({
  subscription,
}: {
  subscription: {
    plan: SubscriptionPlan;
    baseClasses: number;
    carryForwardClasses: number;
    startDate: Date;
    endDate: Date | null;
  };
}) {
  const [plan, setPlan] = useState<SubscriptionPlan>(subscription.plan);
  const [customClasses, setCustomClasses] = useState(subscription.plan === "CUSTOM" ? subscription.baseClasses : 0);

  return (
    <div className="space-y-3">
      <Select label="Plan" name="plan" value={plan} onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}>
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
          name="baseClasses"
          type="number"
          min="1"
          required
          value={customClasses || ""}
          onChange={(e) => setCustomClasses(Number(e.target.value) || 0)}
        />
      )}
      <Input label="Start date" name="startDate" type="date" defaultValue={toInputDate(subscription.startDate)} />
      <Input
        label="Expiry date"
        name="endDate"
        type="date"
        defaultValue={subscription.endDate ? toInputDate(subscription.endDate) : ""}
      />
      <Input
        label="Carry forward classes"
        name="carryForwardClasses"
        type="number"
        min="0"
        defaultValue={subscription.carryForwardClasses}
      />
    </div>
  );
}
