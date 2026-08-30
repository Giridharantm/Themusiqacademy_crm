import { ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions/auth-actions";

export function AppShell({
  userName,
  links,
  children,
}: {
  userName: string;
  links: { href: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-vinyl-cream print:bg-white">
      <header className="bg-vinyl-teal border-b-4 border-vinyl-coral print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <span className="flex items-center gap-2 font-display font-semibold text-vinyl-cream">
              <span className="w-7 h-7 rounded-full bg-vinyl-sun text-vinyl-teal flex items-center justify-center text-xs font-bold">M</span>
              The Musiq Academy
            </span>
            <nav className="hidden sm:flex items-center gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 rounded-md text-sm font-medium text-vinyl-cream/75 hover:text-vinyl-cream hover:bg-white/10"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="text-sm text-vinyl-cream/70 hover:text-vinyl-cream hidden sm:inline px-2 py-1 rounded-md hover:bg-white/10"
            >
              {userName}
            </Link>
            <form action={logoutAction}>
              <button className="text-sm text-vinyl-cream/85 hover:text-vinyl-cream px-3 py-1.5 rounded-md hover:bg-white/10">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="sm:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-vinyl-cream/80 hover:bg-white/10 whitespace-nowrap"
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
