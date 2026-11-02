"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref, isCurrent, isGroup, type NavItem } from "@/lib/nav";

// The menu. On a wide screen: links in the header, with groups that open a small
// panel under them. On a narrow screen: one "Menu" button that opens everything
// as a list. Either closes on a click elsewhere, on Escape, or after going to a page.
export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const active = activeHref(items, pathname);
  // What is open belongs to the page it was opened on, so going to another page
  // closes it without anything having to reset it.
  const [ui, setUi] = useState<{ path: string; group: string | null; menu: boolean }>({ path: pathname, group: null, menu: false });
  const openGroup = ui.path === pathname ? ui.group : null;
  const menuOpen = ui.path === pathname ? ui.menu : false;
  const setOpenGroup = (group: string | null) => setUi({ path: pathname, group, menu: false });
  const setMenuOpen = (update: boolean | ((open: boolean) => boolean)) =>
    setUi({ path: pathname, group: null, menu: typeof update === "function" ? update(menuOpen) : update });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setUi({ path: pathname, group: null, menu: false });
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUi({ path: pathname, group: null, menu: false });
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [pathname]);

  const bar = "px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap";
  const tone = (current: boolean) => (current ? "text-page bg-white/15" : "text-page/75 hover:text-page hover:bg-white/10");

  return (
    <div ref={root} className="min-w-0">
      <nav aria-label="Main" className="hidden xl:flex items-center gap-1">
        {items.map((item) =>
          isGroup(item) ? (
            <div key={item.label} className="relative">
              <button
                type="button"
                aria-expanded={openGroup === item.label}
                aria-haspopup="menu"
                onClick={() => setOpenGroup(openGroup === item.label ? null : item.label)}
                className={`${bar} inline-flex items-center gap-1 ${tone(isCurrent(item, active) || openGroup === item.label)}`}
              >
                {item.label}
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`transition-transform ${openGroup === item.label ? "rotate-180" : ""}`}>
                  <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {openGroup === item.label && (
                <div role="menu" className="absolute left-0 top-full z-30 mt-1 min-w-[12.5rem] rounded-lg border border-line bg-white py-1 shadow-lg">
                  {item.items.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      role="menuitem"
                      className={`block px-4 py-2 text-sm ${l.href === active ? "bg-panel font-semibold text-ink" : "text-ink/80 hover:bg-panel hover:text-ink"}`}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link key={item.href} href={item.href} className={`${bar} ${tone(isCurrent(item, active))}`}>
              {item.label}
            </Link>
          )
        )}
      </nav>

      <div className="xl:hidden">
        <button
          type="button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex items-center gap-2 rounded-md border border-white/25 px-3 py-1.5 text-sm font-medium text-page hover:bg-white/10"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Menu
        </button>
        {menuOpen && (
          <nav aria-label="Main" className="absolute inset-x-0 top-full z-30 max-h-[75vh] overflow-y-auto border-t border-gold/40 bg-brand px-4 pb-4 pt-2 shadow-lg">
            {items.map((item) =>
              isGroup(item) ? (
                <div key={item.label} className="mt-3">
                  <p className="px-2 pb-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-gold">{item.label}</p>
                  {item.items.map((l) => (
                    <Link key={l.href} href={l.href} className={`block rounded-md px-3 py-2 text-sm ${l.href === active ? "bg-white/15 text-page" : "text-page/85 hover:bg-white/10"}`}>
                      {l.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link key={item.href} href={item.href} className={`mt-3 block rounded-md px-3 py-2 text-sm font-medium first:mt-1 ${isCurrent(item, active) ? "bg-white/15 text-page" : "text-page/90 hover:bg-white/10"}`}>
                  {item.label}
                </Link>
              )
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
