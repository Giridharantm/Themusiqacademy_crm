import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { currentUser } from "@/lib/authz";
import { canAccessAdminPath } from "@/lib/permissions";
import { unreadConversationCount } from "@/lib/whatsapp-service";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/attendance", label: "Attendance" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/batches", label: "Batches" },
  { href: "/admin/teachers", label: "Teachers" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/whatsapp", label: "WhatsApp" },
  { href: "/admin/reports", label: "Reports" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [user, unread] = await Promise.all([currentUser(), unreadConversationCount()]);
  // Inbox sits right after the WhatsApp overview, with a count while messages wait.
  const allLinks = links.flatMap((l) => (l.href === "/admin/whatsapp" ? [l, { href: "/admin/whatsapp/inbox", label: unread > 0 ? `Inbox (${unread})` : "Inbox" }] : [l]));
  // Each person only sees the pages their role may open.
  const visible = allLinks.filter((l) => canAccessAdminPath(user?.role, l.href));
  return (
    <AppShell userName={user?.name ?? ""} links={visible}>
      {children}
    </AppShell>
  );
}
