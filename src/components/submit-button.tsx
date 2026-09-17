"use client";

import { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

// Disables itself while its parent form's Server Action is pending, so a
// slow round-trip (or an impatient double-click) can't submit the same
// action twice — e.g. raising the same invoice twice in a row.
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={className} disabled={pending}>
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}
