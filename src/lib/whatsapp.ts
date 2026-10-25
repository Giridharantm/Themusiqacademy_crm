// Parsing and signature checks for Meta's WhatsApp Cloud API webhook
// (POST /api/whatsapp/webhook). Kept free of Next/Prisma imports so it can be
// unit-tested; the route handler wires it to the database.
import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeIndianPhone } from "@/lib/trial-request";

// Meta signs every webhook body with the app secret and sends the result as
// "X-Hub-Signature-256: sha256=<hex>". Anything unsigned or mis-signed is
// not from Meta and must be dropped.
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type InboundMessage = {
  id: string;
  from: string; // digits only, with country code, e.g. "919845708094"
  name: string | null; // the sender's WhatsApp profile name
  text: string;
};

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// What a message says, as plain text for a lead note. Non-text messages
// (photos, voice notes, location…) can't be shown here, so say what they are.
function messageText(m: Record<string, unknown>): string {
  const type = typeof m.type === "string" ? m.type : "unknown";
  if (type === "text") return String(asRecord(m.text)?.body ?? "").trim();
  if (type === "button") return String(asRecord(m.button)?.text ?? "").trim() || "[button reply]";
  if (type === "interactive") {
    const i = asRecord(m.interactive);
    const reply = asRecord(i?.button_reply) ?? asRecord(i?.list_reply);
    return String(reply?.title ?? "").trim() || "[interactive reply]";
  }
  return `[${type} message]`;
}

// Pulls the customer messages out of a webhook payload. Delivery/read status
// updates and anything malformed are ignored.
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const root = asRecord(payload);
  if (!root || root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return out;

  for (const entry of root.entry) {
    const changes = asRecord(entry)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const c = asRecord(change);
      if (c?.field !== "messages") continue;
      const value = asRecord(c.value);
      if (!value || !Array.isArray(value.messages)) continue;

      const names = new Map<string, string>();
      if (Array.isArray(value.contacts)) {
        for (const contact of value.contacts) {
          const ct = asRecord(contact);
          const waId = typeof ct?.wa_id === "string" ? ct.wa_id : null;
          const name = asRecord(ct?.profile)?.name;
          if (waId && typeof name === "string" && name.trim()) names.set(waId, name.trim());
        }
      }

      for (const message of value.messages) {
        const m = asRecord(message);
        if (!m || typeof m.id !== "string" || typeof m.from !== "string") continue;
        const from = m.from.replace(/\D/g, "");
        if (!from) continue;
        out.push({ id: m.id, from, name: names.get(m.from) ?? null, text: messageText(m).slice(0, 1000) });
      }
    }
  }
  return out;
}

// Indian numbers are stored as the bare 10 digits everywhere else in the CRM,
// so a WhatsApp "919845708094" has to match that; a foreign number is kept in
// full with a "+" so it can't collide with an Indian one.
export function leadPhoneFromWhatsApp(from: string): string {
  return normalizeIndianPhone(from) ?? `+${from}`;
}

export function whatsappNote(text: string, at: Date): string {
  return `WhatsApp ${at.toISOString().slice(0, 16).replace("T", " ")} UTC: ${text || "[empty message]"}`;
}

// Meta re-sends a webhook when it doesn't get a quick 200, so the same
// message can arrive twice. Remembering recent ids is enough — the app runs
// as one container, and a restart only risks one duplicate note.
export function createSeenIds(max = 2000) {
  const seen = new Set<string>();
  return {
    // Returns true the first time an id is offered, false on repeats.
    add(id: string): boolean {
      if (seen.has(id)) return false;
      seen.add(id);
      if (seen.size > max) seen.delete(seen.values().next().value as string);
      return true;
    },
  };
}
