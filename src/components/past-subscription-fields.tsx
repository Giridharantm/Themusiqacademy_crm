"use client";

import { useState } from "react";
import { Input, Select, Textarea } from "@/components/ui";
import { PLAN_LABELS, PLAN_CLASSES, type SubscriptionPlan } from "@/lib/subscription";

type Initial = {
  plan: SubscriptionPlan;
  baseClasses: number;
  startDate: string;
  endDate: string | null;
  classesUsedAtClose: number;
  status: "EXPIRED" | "CANCELLED";
};

// Logs a subscription cycle that already ran its course before it was ever
// entered here — its own plan, dates, and completed count, kept as a
// distinct row in "past subscriptions" rather than folded into the current
// package's classesUsedAtMigration offset. No live totals preview here (an
// already-closed cycle doesn't have a "remaining" — that's the whole point
// of it being past), just what actually happened.
//
// Pass `initial` to reuse this for editing an existing past subscription
// instead of creating a new one — the bonus-classes fields are hidden then,
// since editing shouldn't silently grant another bonus on top of whatever
// was already given.
export function PastSubscriptionFields({ initial }: { initial?: Initial }) {
  const [plan, setPlan] = useState<SubscriptionPlan>(initial?.plan ?? "THREE_MONTHS");
  const [customClasses, setCustomClasses] = useState(initial?.plan === "CUSTOM" ? initial.baseClasses : 0);
  const [bonusClasses, setBonusClasses] = useState(0);

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
      <Input label="Start date" name="startDate" type="date" required defaultValue={initial?.startDate} />
      <Input label="End date" name="endDate" type="date" hint="When this cycle actually ended" defaultValue={initial?.endDate ?? undefined} />
      {!initial && (
        <>
          <Input
            label="Bonus classes"
            name="bonusClasses"
            type="number"
            min="0"
            value={bonusClasses || ""}
            onChange={(e) => setBonusClasses(Number(e.target.value) || 0)}
            placeholder="0"
          />
          {bonusClasses > 0 && <Textarea label="Bonus reason" name="bonusReason" placeholder="e.g. Diwali offer" />}
        </>
      )}
      <Input
        label="Classes completed"
        name="classesUsedAtClose"
        type="number"
        min="0"
        required
        defaultValue={initial?.classesUsedAtClose}
        hint="How many of this package's classes were actually attended"
      />
      <Select label="How it ended" name="status" defaultValue={initial?.status ?? "EXPIRED"}>
        <option value="EXPIRED">Completed the full plan</option>
        <option value="CANCELLED">Cancelled early</option>
      </Select>
    </div>
  );
}
