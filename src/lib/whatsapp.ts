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

// A one-line, PII-free description of a webhook payload for the server log
// (which fields changed, how many messages/statuses, and which keys the
// first message carries), so a message that never becomes a lead can be told
// apart from one Meta never sent.
export function summarizeWebhook(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) return "not-an-object";
  const fields: string[] = [];
  let messages = 0;
  let statuses = 0;
  let messageKeys: string[] = [];
  if (Array.isArray(root.entry)) {
    for (const entry of root.entry) {
      const changes = asRecord(entry)?.changes;
      if (!Array.isArray(changes)) continue;
      for (const change of changes) {
        const c = asRecord(change);
        if (typeof c?.field === "string") fields.push(c.field);
        const value = asRecord(c?.value);
        if (Array.isArray(value?.messages)) {
          messages += value.messages.length;
          const first = asRecord(value.messages[0]);
          if (first && messageKeys.length === 0) messageKeys = Object.keys(first);
        }
        if (Array.isArray(value?.statuses)) statuses += value.statuses.length;
      }
    }
  }
  return `object=${String(root.object)} fields=[${fields.join(",")}] messages=${messages} statuses=${statuses} messageKeys=[${messageKeys.join(",")}]`;
}

export type StatusUpdate = {
  id: string; // the wamid we got back when sending
  status: string; // sent | delivered | read | failed
  errorCode: number | null;
  errorTitle: string | null;
  errorDetail: string | null;
};

// Delivery receipts for messages WE sent. WhatsApp accepts a send first and
// can still fail it afterwards (not on WhatsApp, blocked, re-engagement
// window…), and only these callbacks say so.
export function parseStatusUpdates(payload: unknown): StatusUpdate[] {
  const out: StatusUpdate[] = [];
  const root = asRecord(payload);
  if (!root || root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return out;
  for (const entry of root.entry) {
    const changes = asRecord(entry)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const c = asRecord(change);
      if (c?.field !== "messages") continue;
      const statuses = asRecord(c.value)?.statuses;
      if (!Array.isArray(statuses)) continue;
      for (const s of statuses) {
        const st = asRecord(s);
        if (!st || typeof st.id !== "string" || typeof st.status !== "string") continue;
        const err = Array.isArray(st.errors) ? asRecord(st.errors[0]) : null;
        out.push({
          id: st.id,
          status: st.status,
          errorCode: typeof err?.code === "number" ? err.code : null,
          errorTitle: typeof err?.title === "string" ? err.title : typeof err?.message === "string" ? err.message : null,
          errorDetail: typeof asRecord(err?.error_data)?.details === "string" ? (asRecord(err?.error_data)!.details as string) : null,
        });
      }
    }
  }
  return out;
}
