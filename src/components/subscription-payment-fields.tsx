"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui";
import { DISCOUNT_STEPS } from "@/lib/subscription";

// The payment form on a subscription: what was received, and how. The invoice
// total follows the package price and discount as they are changed, and the
// amount received starts at the full total (edit it down for a part payment —
// the balance and its due date then appear).
export function SubscriptionPaymentFields({ price, defaultDueBy }: { price: number | null; defaultDueBy: string }) {
  const [customPrice, setCustomPrice] = useState("");
  const [discount, setDiscount] = useState(0);
  const [received, setReceived] = useState<string | null>(null);

  const fee = price ?? (Number(customPrice) || 0);
  const total = Math.max(fee - discount, 0);
  const amount = received ?? String(total);
  const balance = Math.max(total - (Number(amount) || 0), 0);
  const rs = (n: number) => `Rs. ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-3">
      {price === null && (
        <Input label="Package price (Rs., incl. GST)" name="price" type="number" min="1" step="0.01" required value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
      )}
      <Select label="Discount (Rs.)" name="discount" value={String(discount)} onChange={(e) => setDiscount(Number(e.target.value))}>
        <option value="0">No discount</option>
        {DISCOUNT_STEPS.map((d) => (
          <option key={d} value={d}>
            {rs(d)}
          </option>
        ))}
      </Select>
      <p className="text-xs text-muted">
        Invoice total (incl. GST): <b className="text-ink">{rs(total)}</b>
      </p>
      <Input label="Amount received (Rs.)" name="amount" type="number" min="1" max={total || undefined} step="0.01" required value={amount} onChange={(e) => setReceived(e.target.value)} />
      <Select label="Paid by" name="method" defaultValue="UPI">
        <option value="CASH">Cash</option>
        <option value="UPI">UPI</option>
        <option value="CARD">Card</option>
        <option value="BANK_TRANSFER">Bank transfer</option>
        <option value="OTHER">Other</option>
      </Select>
      {balance > 0 && (
        <div className="rounded-md border border-line bg-panel px-3 py-2 space-y-2">
          <p className="text-xs text-ink">
            Part payment: <b>{rs(balance)}</b> will stay due.
          </p>
          <Input label="Balance due by" name="balanceDueBy" type="date" required defaultValue={defaultDueBy} />
        </div>
      )}
      <Input label="Note" name="note" placeholder="e.g. UPI reference" />
    </div>
  );
}
