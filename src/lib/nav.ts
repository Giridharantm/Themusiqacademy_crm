// The admin menu, grouped. Pure: the layout feeds it the role (and the unread
// inbox count) and gets back only what that person may open.
import { canAccessAdminPath } from "@/lib/permissions";

export type NavLink = { href: string; label: string };
export type NavGroup = { label: string; items: NavLink[] };
export type NavItem = NavLink | NavGroup;

export const isGroup = (item: NavItem): item is NavGroup => "items" in item;

export function adminNav(unreadInbox = 0): NavItem[] {
  return [
    { href: "/admin", label: "Dashboard" },
    {
      label: "People",
      items: [
        { href: "/admin/leads", label: "Leads" },
        { href: "/admin/students", label: "Students" },
        { href: "/admin/teachers", label: "Teachers" },
        { href: "/admin/users", label: "Users" },
      ],
    },
    {
      label: "Classes",
      items: [
        { href: "/admin/attendance", label: "Attendance" },
        { href: "/admin/teacher-attendance", label: "Teacher attendance" },
        { href: "/admin/schedule", label: "Day schedule" },
        { href: "/admin/changes", label: "Class changes" },
        { href: "/admin/batches", label: "Batches" },
        { href: "/admin/courses", label: "Courses" },
      ],
    },
    {
      label: "Money",
      items: [
        { href: "/admin/billing", label: "Billing" },
        { href: "/admin/expenses", label: "Expenses" },
        { href: "/admin/payroll", label: "Payroll" },
        { href: "/admin/reports/pnl", label: "Profit & loss" },
      ],
    },
    {
      label: "WhatsApp",
      items: [
        { href: "/admin/whatsapp", label: "Overview" },
        { href: "/admin/whatsapp/inbox", label: unreadInbox > 0 ? `Inbox (${unreadInbox})` : "Inbox" },
      ],
    },
    { href: "/admin/reports", label: "Reports" },
  ];
}

// Keeps only what this role may open. A group left with nothing disappears; a
// group left with one page becomes that page's own link (front desk's WhatsApp
// menu is just "Inbox").
export function visibleNav(items: NavItem[], role: string | undefined): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (!isGroup(item)) {
      if (canAccessAdminPath(role, item.href)) out.push(item);
      continue;
    }
    const open = item.items.filter((l) => canAccessAdminPath(role, l.href));
    if (open.length === 1) out.push(open[0]);
    else if (open.length > 1) out.push({ label: item.label, items: open });
  }
  return out;
}

const flat = (items: NavItem[]): NavLink[] => items.flatMap((i) => (isGroup(i) ? i.items : [i]));

// The one link the page being viewed belongs to: the longest matching address,
// so "/admin/reports/pnl" lights up Profit & loss and not Reports, and an inbox
// page lights up Inbox and not the WhatsApp overview. A home link (/admin,
// /teacher, /parent) only matches itself.
export function activeHref(items: NavItem[], pathname: string): string | null {
  const homes = ["/admin", "/teacher", "/parent"];
  const under = (href: string) => (homes.includes(href) ? pathname === href : pathname === href || pathname.startsWith(href + "/"));
  return flat(items).map((l) => l.href).filter(under).sort((a, b) => b.length - a.length)[0] ?? null;
}

// Whether an item (a link, or a group holding that link) is the current one.
export function isCurrent(item: NavItem, active: string | null): boolean {
  return !!active && flat([item]).some((l) => l.href === active);
}
