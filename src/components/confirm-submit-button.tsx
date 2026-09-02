"use client";

import { ReactNode } from "react";
import { Button } from "@/components/ui";

// A submit button for a Server Action form that asks for confirmation first
// — clicking it shows a native OK/Cancel prompt, and only lets the form
// actually submit if the user confirms. Use for actions that are hard to
// reverse (cancelling a subscription, deleting something with history).
export function ConfirmSubmitButton({
  confirmMessage,
  variant = "ghost",
  className,
  children,
}: {
  confirmMessage: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
