import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { currentUser } from "@/lib/authz";

const links = [{ href: "/parent", label: "My Children" }];

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <AppShell userName={user?.name ?? ""} links={links}>
      {children}
    </AppShell>
  );
}
