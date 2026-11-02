import { describe, it, expect } from "vitest";
import { activeHref, adminNav, isCurrent, isGroup, visibleNav } from "./nav";

const labels = (items: ReturnType<typeof visibleNav>) => items.map((i) => (isGroup(i) ? `${i.label}[${i.items.map((l) => l.label).join(",")}]` : i.label));

describe("admin menu", () => {
  it("groups the admin's pages", () => {
    expect(labels(visibleNav(adminNav(), "ADMIN"))).toEqual([
      "Dashboard",
      "People[Leads,Students,Teachers,Users]",
      "Classes[Attendance,Day schedule,Class changes,Batches,Courses]",
      "Money[Billing,Expenses,Payroll,Profit & loss]",
      "WhatsApp[Overview,Inbox]",
      "Reports",
    ]);
  });

  it("shows front desk only what it may open, collapsing one-page groups", () => {
    expect(labels(visibleNav(adminNav(), "FRONT_DESK"))).toEqual([
      "Dashboard",
      "People[Leads,Students]",
      "Classes[Attendance,Day schedule,Class changes,Batches]",
      "Money[Billing,Expenses]",
      "Inbox",
    ]);
  });

  it("never shows payroll or profit and loss to front desk", () => {
    const text = JSON.stringify(visibleNav(adminNav(), "FRONT_DESK"));
    expect(text).not.toMatch(/payroll|Profit|pnl/i);
  });

  it("shows the unread count on the inbox link", () => {
    expect(JSON.stringify(visibleNav(adminNav(3), "FRONT_DESK"))).toContain("Inbox (3)");
  });

  it("shows nothing to a role with no admin access", () => {
    expect(visibleNav(adminNav(), "TEACHER")).toEqual([]);
  });
});

describe("which menu entry is current", () => {
  const items = visibleNav(adminNav(), "ADMIN");
  const current = (path: string) => items.filter((i) => isCurrent(i, activeHref(items, path))).map((i) => i.label);

  it("lights up the group a page belongs to", () => {
    expect(current("/admin/students/abc123")).toEqual(["People"]);
    expect(current("/admin/expenses")).toEqual(["Money"]);
    expect(current("/admin")).toEqual(["Dashboard"]);
  });

  it("prefers the most specific link", () => {
    expect(current("/admin/reports/pnl")).toEqual(["Money"]);
    expect(current("/admin/reports/students")).toEqual(["Reports"]);
    expect(current("/admin/whatsapp/inbox")).toEqual(["WhatsApp"]);
  });

  it("highlights nothing for an unknown page", () => {
    expect(current("/somewhere/else")).toEqual([]);
  });
});
