import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { currentUser } from "@/lib/authz";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/attendance", label: "Attendance" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/batches", label: "Batches" },
  { href: "/admin/teachers", label: "Teachers" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/reports", label: "Reports" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <AppShell userName={user?.name ?? ""} links={links}>
      {children}
    </AppShell>
  );
}
