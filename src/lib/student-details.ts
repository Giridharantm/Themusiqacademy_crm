// The editable details of a student record (name, phone, …), checked before they
// are saved. Kept apart from the Server Action so the rules can be unit-tested.
import { normalizePhone } from "@/lib/whatsapp-notices";

export type StudentDetails = {
  name: string;
  dob: Date | null;
  gender: string | null;
  phone: string | null; // stored the way WhatsApp sees it: 10 digits, or "+<digits>" for a foreign number
  email: string | null;
  address: string | null;
};

type Raw = { name?: unknown; dob?: unknown; gender?: unknown; phone?: unknown; email?: unknown; address?: unknown };

const GENDERS = ["Male", "Female", "Other"];
const text = (v: unknown) => String(v ?? "").trim();

export function parseStudentDetails(raw: Raw): { ok: true; value: StudentDetails } | { ok: false; error: string } {
  const name = text(raw.name);
  if (!name) return { ok: false, error: "Name is required" };

  const phoneText = text(raw.phone);
  const phone = phoneText ? normalizePhone(phoneText) : null;
  if (phoneText && !phone) return { ok: false, error: "That phone number is not valid — use 10 digits (or +country code for a foreign number)" };

  const email = text(raw.email) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email address is not valid" };

  const dobText = text(raw.dob);
  let dob: Date | null = null;
  if (dobText) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobText);
    const d = m ? new Date(dobText) : null;
    if (!m || !d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dobText) return { ok: false, error: "That date of birth is not valid" };
    dob = d;
  }

  const gender = text(raw.gender) || null;
  if (gender && !GENDERS.includes(gender)) return { ok: false, error: "Choose Male, Female or Other for gender" };

  return { ok: true, value: { name, dob, gender, phone, email, address: text(raw.address) || null } };
}
