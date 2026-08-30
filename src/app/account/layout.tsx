import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { currentUser } from "@/lib/authz";

const HOME_BY_ROLE: Record<string, string> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  PARENT: "/parent",
};

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const homeHref = (user && HOME_BY_ROLE[user.role]) || "/";

  return (
    <AppShell userName={user?.name ?? ""} links={[{ href: homeHref, label: "← Back to Dashboard" }]}>
      {children}
    </AppShell>
  );
}
