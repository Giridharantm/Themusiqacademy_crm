"use client";

export function AutoSubmitDateInput({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <input
      type="date"
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
    />
  );
}
