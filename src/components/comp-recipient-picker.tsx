"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

type Row = {
  id: string; // student + instrument, what the form posts
  studentName: string;
  detail: string; // "Carnatic Vocals · regular class 5:00 PM, comp 5:30 PM"
  phones: { phone: string; consented: boolean }[];
};

// The recipient list of a comp class notice, with a tick box per student so a
// comp class can go to some of a batch rather than all of it. Students with no
// number that has agreed to WhatsApp can't be ticked (nothing would be sent).
export function CompRecipientPicker({
  rows,
  hidden,
  action,
  nouns = ["student", "students"],
}: {
  rows: Row[];
  hidden: { name: string; value: string }[];
  action: (formData: FormData) => void | Promise<void>;
  // What a row is called in the counts: a student, or (for an announcement) a family.
  nouns?: [string, string];
}) {
  const reachable = (r: Row) => r.phones.filter((p) => p.consented).length;
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.filter((r) => reachable(r) > 0).map((r) => r.id)));
  const chosen = rows.filter((r) => picked.has(r.id));
  const messages = chosen.reduce((n, r) => n + reachable(r), 0);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <form action={action} className="space-y-3">
      {hidden.map((h, i) => (
        <input key={`${h.name}-${i}`} type="hidden" name={h.name} value={h.value} />
      ))}

      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-slate-700">
          <strong>{chosen.length}</strong> of {rows.length} {rows.length === 1 ? nouns[0] : nouns[1]} ticked · <strong>{messages}</strong> message{messages === 1 ? "" : "s"}
        </p>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" onClick={() => setPicked(new Set(rows.filter((r) => reachable(r) > 0).map((r) => r.id)))}>
            Tick all
          </Button>
          <Button type="button" variant="ghost" onClick={() => setPicked(new Set())}>
            Clear
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-slate-100 rounded-md border border-line max-h-96 overflow-y-auto">
        {rows.map((r) => {
          const can = reachable(r) > 0;
          return (
            <li key={r.id}>
              <label className={`px-3 py-2 flex items-start justify-between gap-3 ${can ? "cursor-pointer" : "opacity-70"}`}>
                <span className="flex items-start gap-2 min-w-0">
                  <input
                    type="checkbox"
                    name="pick"
                    value={r.id}
                    className="mt-1"
                    checked={picked.has(r.id)}
                    disabled={!can}
                    onChange={() => toggle(r.id)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-900">{r.studentName}</span>
                    <span className="block text-xs text-slate-500">{r.detail}</span>
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  {r.phones.length === 0 ? (
                    <Badge color="red">No phone number</Badge>
                  ) : (
                    r.phones.map((p) => (
                      <Badge key={p.phone} color={p.consented ? "green" : "yellow"}>
                        {p.phone} · {p.consented ? "will receive" : "hasn't agreed"}
                      </Badge>
                    ))
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {messages === 0 ? (
        <p className="text-sm text-amber-700">Tick at least one student to send.</p>
      ) : (
        <ConfirmSubmitButton
          variant="primary"
          className="w-full"
          confirmMessage={`Send ${messages} WhatsApp message${messages === 1 ? "" : "s"} now? This can't be undone.`}
        >
          Send {messages} message{messages === 1 ? "" : "s"} on WhatsApp
        </ConfirmSubmitButton>
      )}
    </form>
  );
}
