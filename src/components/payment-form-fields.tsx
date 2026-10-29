"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui";
import { PLAN_INVOICE_AMOUNTS, PLAN_LABELS, PLAN_CLASSES } from "@/lib/subscription";
import { PACKAGE_PLANS, type PackagePlan } from "@/lib/invoice-payment";

// The fields of the "Record a payment" form: what the money is for
// (instrument, package, start date, discount), what was received and how, with
// the transaction id. The fee after discount follows the package and discount,
// and the amount received starts at that fee — lower it for a part payment.
export function PaymentFormFields({ courses, defaultStart }: { courses: { id: string; name: string }[]; defaultStart: string }) {
  const [plan, setPlan] = useState<PackagePlan>("THREE_MONTHS");
  const [discount, setDiscount] = useState("");
  const [received, setReceived] = useState<string | null>(null);

  const gross = PLAN_INVOICE_AMOUNTS[plan];
  const fee = Math.max(gross - (Number(discount) || 0), 0);
  const amount = received ?? String(fee);
  const rs = (n: number) => `Rs. ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-3">
      <Select label="Instrument" name="courseId" required defaultValue="">
        <option value="" disabled>
          Select an instrument
        </option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        label="Subscription"
        name="plan"
        value={plan}
        onChange={(e) => {
          setPlan(e.target.value as PackagePlan);
          setReceived(null);
        }}
      >
        {PACKAGE_PLANS.map((p) => (
          <option key={p} value={p}>
            {PLAN_LABELS[p]} — {PLAN_CLASSES[p]} classes — {rs(PLAN_INVOICE_AMOUNTS[p])}
          </option>
        ))}
      </Select>
      <Input label="Start date" name="startDate" type="date" required defaultValue={defaultStart} />
      <Input
        label="Discount (Rs.)"
        name="discount"
        type="number"
        min="0"
        step="0.01"
        placeholder="0"
        value={discount}
        onChange={(e) => {
          setDiscount(e.target.value);
          setReceived(null);
        }}
      />
      <p className="text-xs text-muted">
        Fee after discount (incl. GST): <b className="text-ink">{rs(fee)}</b>
      </p>
      <Input label="Amount received (Rs.)" name="amount" type="number" min="0.01" max={fee || undefined} step="0.01" required value={amount} onChange={(e) => setReceived(e.target.value)} />
      <Select label="Payment mode" name="method" defaultValue="UPI">
        <option value="CASH">Cash</option>
        <option value="UPI">UPI</option>
        <option value="CARD">Card</option>
        <option value="BANK_TRANSFER">Bank transfer</option>
        <option value="OTHER">Other</option>
      </Select>
      <Input label="Transaction ID / reference" name="reference" placeholder="UPI reference, cheque number…" />
      <Input label="Note" name="note" />
    </div>
  );
}
