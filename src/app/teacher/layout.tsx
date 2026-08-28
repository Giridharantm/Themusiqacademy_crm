import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { currentUser } from "@/lib/authz";

const links = [
  { href: "/teacher", label: "My Batches" },
  { href: "/teacher/attendance", label: "Attendance" },
];

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <AppShell userName={user?.name ?? ""} links={links}>
      {children}
    </AppShell>
  );
}
