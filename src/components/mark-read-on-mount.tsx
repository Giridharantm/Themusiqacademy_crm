"use client";

import { useEffect } from "react";
import { markInboxRead } from "@/lib/actions/whatsapp-actions";

// Opening a conversation marks it read. Done from the browser after the page
// has loaded (not while rendering it) so that a link merely being prefetched
// can never clear someone's unread message.
export function MarkReadOnMount({ phone }: { phone: string }) {
  useEffect(() => {
    void markInboxRead(phone);
  }, [phone]);
  return null;
}
