"use client";

import { Button } from "@/components/ui";

export function PrintButton({ label = "Print invoice", className = "w-full", variant = "secondary" }: { label?: string; className?: string; variant?: "primary" | "secondary" }) {
  return (
    <Button type="button" variant={variant} className={className} onClick={() => window.print()}>
      {label}
    </Button>
  );
}
