"use client";

import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button type="button" variant="secondary" className="w-full" onClick={() => window.print()}>
      Print invoice
    </Button>
  );
}
