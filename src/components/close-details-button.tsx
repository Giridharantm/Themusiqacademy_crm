"use client";

import { ReactNode } from "react";

export function CloseDetailsButton({ children = "Cancel" }: { children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.closest("details")?.removeAttribute("open");
      }}
      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}
