import { normalizePhone } from "@/lib/whatsapp-notices";

// What someone types on the sign-in page: an email address (staff and any
// older login) or a phone number (students, parents and guardians — their
// username is their number, however they type it).
export type LoginId = { kind: "email"; email: string } | { kind: "phone"; phone: string };

export function parseLoginId(input: string | null | undefined): LoginId | null {
  const value = (input ?? "").trim();
  if (!value) return null;
  if (value.includes("@")) return { kind: "email", email: value };
  const phone = normalizePhone(value);
  return phone ? { kind: "phone", phone } : null;
}

// A learner login made from a phone number alone still needs an email (the
// account table requires one, and it must be unique). It is never mailed to:
// ".invalid" is reserved and can't be a real address.
const PLACEHOLDER_DOMAIN = "learner.musiqacademy.invalid";

export function placeholderEmail(phone: string): string {
  return `${phone.replace(/\D/g, "")}@${PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith("@" + PLACEHOLDER_DOMAIN);
}

// How a number is matched against stored ones, which are kept as typed
// ("98457 08094"): the last 10 digits for an Indian number, all digits for a
// foreign one.
export function phoneMatchTail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return phone.startsWith("+") ? digits : digits.slice(-10);
}
