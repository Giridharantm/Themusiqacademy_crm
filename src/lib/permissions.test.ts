import { describe, it, expect } from "vitest";
import { canAccessAdminPath, isStaffRole } from "./permissions";

describe("canAccessAdminPath", () => {
  it("lets the admin open everything", () => {
    for (const p of ["/admin", "/admin/reports", "/admin/teachers", "/admin/staff", "/admin/whatsapp/reminders", "/admin/students/export"]) {
      expect(canAccessAdminPath("ADMIN", p)).toBe(true);
    }
  });

  it("gives front desk the desk work", () => {
    for (const p of [
      "/admin",
      "/admin/leads",
      "/admin/leads/abc123",
      "/admin/students",
      "/admin/students/abc123",
      "/admin/attendance",
      "/admin/batches",
      "/admin/batches/abc123",
      "/admin/billing",
      "/admin/billing/abc123",
      "/admin/billing/abc123/invoice",
      "/admin/whatsapp/inbox",
    ]) {
      expect(canAccessAdminPath("FRONT_DESK", p)).toBe(true);
    }
  });

  it("keeps front desk out of everything sensitive", () => {
    for (const p of [
      "/admin/reports",
      "/admin/reports/invoices",
      "/admin/reports/invoices/export",
      "/admin/teachers",
      "/admin/teachers/abc123",
      "/admin/courses",
      "/admin/staff",
      "/admin/whatsapp",
      "/admin/whatsapp/new",
      "/admin/whatsapp/reminders",
      "/admin/students/export",
    ]) {
      expect(canAccessAdminPath("FRONT_DESK", p)).toBe(false);
    }
  });

  it("does not match look-alike paths", () => {
    expect(canAccessAdminPath("FRONT_DESK", "/admin/leadsx")).toBe(false);
    expect(canAccessAdminPath("FRONT_DESK", "/admin/whatsapp/inboxes")).toBe(false);
  });

  it("gives teachers, parents and signed-out visitors nothing", () => {
    for (const role of ["TEACHER", "PARENT", undefined]) {
      expect(canAccessAdminPath(role, "/admin")).toBe(false);
      expect(canAccessAdminPath(role, "/admin/leads")).toBe(false);
    }
  });
});

describe("isStaffRole", () => {
  it("is true for admin and front desk only", () => {
    expect(isStaffRole("ADMIN")).toBe(true);
    expect(isStaffRole("FRONT_DESK")).toBe(true);
    expect(isStaffRole("TEACHER")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});
