import { normalizePhone } from "@/lib/whatsapp-notices";

// A new learner login starts with the person's phone number as its password
// (digits only, 10 for an Indian number, with the country code for a foreign
// one), so the front desk can simply tell them "your number". Null when the
// number isn't usable.
export function defaultLoginPassword(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone);
  return normalized ? normalized.replace(/\D/g, "") : null;
}
