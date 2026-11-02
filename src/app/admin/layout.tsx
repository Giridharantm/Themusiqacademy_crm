import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { currentUser } from "@/lib/authz";
import { adminNav, visibleNav } from "@/lib/nav";
import { unreadConversationCount } from "@/lib/whatsapp-service";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [user, unread] = await Promise.all([currentUser(), unreadConversationCount()]);
  // Grouped, and each person only sees the pages their role may open.
  return (
    <AppShell userName={user?.name ?? ""} links={visibleNav(adminNav(unread), user?.role)}>
      {children}
    </AppShell>
  );
}
