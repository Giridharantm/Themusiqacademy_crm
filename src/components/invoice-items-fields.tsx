"use client";

import { useState } from "react";
import { Input, Select, Button } from "@/components/ui";
import { PLAN_LABELS, PLAN_INVOICE_AMOUNTS, type SubscriptionPlan } from "@/lib/subscription";

const INVOICE_PLANS = Object.keys(PLAN_INVOICE_AMOUNTS) as Exclude<SubscriptionPlan, "CUSTOM">[];

export function InvoiceItemsFields({ defaultDescription }: { defaultDescription?: string }) {
  const [rows, setRows] = useState([0]);

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-700">Line items</span>
      {rows.map((rowId, i) => (
        <div key={rowId} className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              name="itemDescription"
              placeholder="Description"
              defaultValue={i === 0 ? defaultDescription : undefined}
              required
            />
          </div>
          <div className="w-56">
            <Select name="itemAmount" defaultValue={String(PLAN_INVOICE_AMOUNTS.ONE_MONTH)}>
              {INVOICE_PLANS.map((plan) => (
                <option key={plan} value={PLAN_INVOICE_AMOUNTS[plan]}>
                  {PLAN_LABELS[plan]} — Rs. {PLAN_INVOICE_AMOUNTS[plan].toLocaleString("en-IN")}
                </option>
              ))}
            </Select>
          </div>
          {rows.length > 1 && (
            <Button type="button" variant="ghost" onClick={() => setRows(rows.filter((r) => r !== rowId))}>
              &times;
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => setRows([...rows, Date.now()])}>
        + Add line item
      </Button>
    </div>
  );
}
