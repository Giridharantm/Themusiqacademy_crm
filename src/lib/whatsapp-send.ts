// The one place that talks to WhatsApp's Cloud API to send messages. Needs
// WHATSAPP_ACCESS_TOKEN (a system-user token) and WHATSAPP_PHONE_NUMBER_ID in
// the server's env. With WHATSAPP_DRY_RUN=1 nothing is sent and every call
// "succeeds", for trying the flow locally.
import { templateRequest, waNumber } from "@/lib/whatsapp-notices";

export type SendResult = { ok: true; id: string | null; dryRun?: boolean } | { ok: false; error: string };

const graphVersion = () => process.env.WHATSAPP_GRAPH_VERSION || "v25.0";

export const isDryRun = () => process.env.WHATSAPP_DRY_RUN === "1";

export function whatsappConfigured(): boolean {
  return isDryRun() || (!!process.env.WHATSAPP_ACCESS_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID);
}

type GraphJson = {
  messages?: { id?: string }[];
  block_users?: { added_users?: unknown[]; removed_users?: unknown[]; failed_users?: { errors?: { message?: string; code?: number }[] }[] };
  error?: { message?: string; code?: number };
};

// One call to the Graph API for this phone number (`/<phone-id>/<path>`).
async function graph(path: string, method: "POST" | "DELETE", body: unknown): Promise<{ ok: true; json: GraphJson } | { ok: false; error: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: "WhatsApp sending is not configured" };
  try {
    const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${phoneId}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = ((await res.json().catch(() => null)) ?? {}) as GraphJson;
    if (!res.ok) {
      const e = json.error;
      return { ok: false, error: `${e?.code ?? res.status}: ${e?.message ?? res.statusText}`.slice(0, 400) };
    }
    return { ok: true, json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 400) : "Request failed" };
  }
}

async function post(body: unknown): Promise<SendResult> {
  if (isDryRun()) return { ok: true, id: null, dryRun: true };
  const r = await graph("messages", "POST", body);
  return r.ok ? { ok: true, id: r.json.messages?.[0]?.id ?? null } : r;
}

// Blocks (or unblocks) a number on WhatsApp itself. WhatsApp only lets a
// business block someone who has messaged it in the last 24 hours.
export async function setWhatsAppBlock(phone: string, blocked: boolean): Promise<{ ok: true; dryRun?: boolean } | { ok: false; error: string }> {
  if (isDryRun()) return { ok: true, dryRun: true };
  const r = await graph("block_users", blocked ? "POST" : "DELETE", { messaging_product: "whatsapp", block_users: [{ user: waNumber(phone) }] });
  if (!r.ok) return r;
  const failed = r.json.block_users?.failed_users?.[0];
  if (failed) return { ok: false, error: failed.errors?.[0]?.message ?? "WhatsApp would not change the block" };
  return { ok: true };
}

// A pre-approved template message — the only kind we can start a conversation
// with (outside the 24 hours after a customer writes to us).
export function sendTemplate(phone: string, template: string, params: string[]): Promise<SendResult> {
  return post(templateRequest(phone, template, params));
}

// Free-form text, only allowed within 24 hours of the customer's last
// message — used for replying to STOP / START.
export function sendText(phone: string, body: string): Promise<SendResult> {
  return post({ messaging_product: "whatsapp", to: waNumber(phone), type: "text", text: { body } });
}
