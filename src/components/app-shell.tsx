import { ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions/auth-actions";
import { BrandLockup } from "@/components/brand";
import { AppNav } from "@/components/app-nav";
import type { NavItem } from "@/lib/nav";

export function AppShell({
  userName,
  links,
  children,
}: {
  userName: string;
  /** Plain links, or groups of links that open as a drop-down. */
  links: NavItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-page print:bg-white">
      <header className="relative bg-brand border-b border-gold/40 shadow-[0_10px_26px_-18px_rgba(28,26,35,0.7)] print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-4 xl:gap-8 min-w-0">
            <BrandLockup />
            <AppNav items={links} />
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="text-sm text-page/70 hover:text-page hidden sm:inline whitespace-nowrap px-2 py-1 rounded-md hover:bg-white/10"
            >
              {userName}
            </Link>
            <form action={logoutAction}>
              <button className="text-sm text-page/85 hover:text-page whitespace-nowrap px-3 py-1.5 rounded-md hover:bg-white/10">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
