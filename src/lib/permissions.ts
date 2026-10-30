// Who may open which admin pages. Admin sees everything; front desk gets the
// day-to-day desk work (leads, students, attendance, batches to look at,
// billing and the WhatsApp inbox) and nothing business-sensitive: no reports,
// revenue or GST, no teachers, courses or staff, no class-reminder controls or
// notices. Pure and import-free so the middleware can use it too — and the
// actions check the same role on the server, so a hidden link is never the
// only protection.

export type AppRole = "ADMIN" | "TEACHER" | "PARENT" | "FRONT_DESK";

// Roles that work in the admin area.
export const STAFF_ROLES = ["ADMIN", "FRONT_DESK"] as const;

const FRONT_DESK_AREAS = ["/admin/leads", "/admin/students", "/admin/attendance", "/admin/batches", "/admin/billing", "/admin/whatsapp/inbox"];

// Download links for whole-student lists would hand the full contact book to
// anyone with a login, so they stay with the admin.
const FRONT_DESK_BLOCKED = ["/admin/students/export"];

const under = (path: string, area: string) => path === area || path.startsWith(area + "/");

export function canAccessAdminPath(role: string | undefined, pathname: string): boolean {
  if (role === "ADMIN") return true;
  if (role !== "FRONT_DESK") return false;
  if (FRONT_DESK_BLOCKED.some((p) => under(pathname, p))) return false;
  return pathname === "/admin" || FRONT_DESK_AREAS.some((area) => under(pathname, area));
}

export const isStaffRole = (role: string | undefined): boolean => role === "ADMIN" || role === "FRONT_DESK";
