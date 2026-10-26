import { ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions/auth-actions";
import { BrandLockup } from "@/components/brand";

export function AppShell({
  userName,
  links,
  children,
}: {
  userName: string;
  links: { href: string; label: string }[];
  children: ReactNode;
}) {
  // The single-row desktop menu only has room for about nine links next to the
  // logo and the user's name; a longer menu (the admin's) goes on its own row
  // under them instead of overlapping.
  const stacked = links.length > 9;
  return (
    <div className="min-h-screen bg-page print:bg-white">
      <header className="bg-brand border-b border-gold/40 shadow-[0_10px_26px_-18px_rgba(28,26,35,0.7)] print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-6 xl:gap-8 min-w-0">
            <BrandLockup />
            <nav className={`${stacked ? "hidden" : "hidden xl:flex"} items-center gap-1`}>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 rounded-md text-sm font-medium text-page/75 hover:text-page hover:bg-white/10"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
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
        <nav
          className={`${stacked ? "max-w-6xl mx-auto w-full px-1 sm:px-4 xl:flex-wrap xl:overflow-visible" : "xl:hidden px-1 sm:px-3"} flex items-center gap-1 pb-2 overflow-x-auto`}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-page/80 hover:bg-white/10 whitespace-nowrap"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
