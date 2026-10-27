import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  verifySignature,
  parseInboundMessages,
  leadPhoneFromWhatsApp,
  whatsappNote,
  createSeenIds,
  createsLead,
  summarizeWebhook,
  parseStatusUpdates,
} from "@/lib/whatsapp";
import { isStartMessage, isStopMessage } from "@/lib/whatsapp-notices";
import { findStudentOrUserByPhone, isBlocked, recordInbound, recordInboundConsent, sendReply, setConsent } from "@/lib/whatsapp-service";

// Receiver for Meta's WhatsApp Cloud API webhook. Meta calls GET once to
// verify the URL when it is saved in the app's Webhooks settings, then POSTs
// every customer message. Only the WHATSAPP_VERIFY_TOKEN and
// WHATSAPP_APP_SECRET env vars (set on the server, never in the repo) let a
// request through, so there is no other auth here.
const seen = createSeenIds();

export async function GET(request: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const p = request.nextUrl.searchParams;
  if (verifyToken && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === verifyToken) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.warn("[whatsapp] webhook POST refused: WHATSAPP_APP_SECRET not set");
    return new NextResponse("Not configured", { status: 503 });
  }

  const raw = await request.text();
  if (raw.length > 200_000) return new NextResponse("Too large", { status: 413 });
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    console.warn("[whatsapp] webhook POST refused: bad or missing signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const inbound = parseInboundMessages(payload);
  // No message text or numbers here — just enough to tell "Meta never called"
  // from "Meta called but the payload wasn't what we expected".
  console.log(`[whatsapp] webhook received: ${summarizeWebhook(payload)} parsed=${inbound.length}`);

  // Receipts for messages we sent: WhatsApp accepts a send first and can still
  // fail it afterwards, so a failure is written back onto the message log row
  // (with Meta's reason) instead of leaving it looking "sent".
  for (const s of parseStatusUpdates(payload)) {
    if (s.status !== "failed") {
      console.log(`[whatsapp] message ${s.status}`);
      continue;
    }
    console.warn(`[whatsapp] message FAILED: code=${s.errorCode} title=${s.errorTitle} detail=${s.errorDetail}`);
    await prisma.whatsAppMessage.updateMany({
      where: { waMessageId: s.id },
      data: { status: "FAILED", error: [s.errorCode, s.errorTitle, s.errorDetail].filter(Boolean).join(" · ").slice(0, 400) || "Delivery failed" },
    });
    revalidatePath("/admin/whatsapp");
  }

  const now = new Date();
  let changed = false;
  let inboxChanged = false;

  for (const msg of inbound) {
    if (!seen.add(msg.id)) continue;
    const phone = leadPhoneFromWhatsApp(msg.from);
    const note = whatsappNote(msg.text, now);

    // A number marked as spam is ignored completely: no inbox entry, no lead.
    if (await isBlocked(phone)) {
      console.log("[whatsapp] message from a blocked number ignored");
      continue;
    }

    // Every incoming message is kept for the inbox (and marks the conversation
    // unread). A repeat — Meta re-sends a webhook it didn't get a quick 200
    // for — is dropped here, so it can't create a second lead or reply.
    if (!(await recordInbound({ id: msg.id, phone, name: msg.name, text: msg.text, at: msg.at }))) continue;
    inboxChanged = true;

    // STOP / START switch class messages off and on for this number, and are
    // confirmed with a short reply. Whoever sends them, student or not.
    if (isStopMessage(msg.text)) {
      await setConsent(phone, false, "whatsapp-reply");
      await sendReply(phone, "You will no longer get class messages from The Musiq Academy on WhatsApp. Send START any time to turn them back on.", msg.id);
      continue;
    }
    if (isStartMessage(msg.text)) {
      await setConsent(phone, true, "whatsapp-reply");
      await sendReply(phone, "Thank you! You will get class reminders and updates from The Musiq Academy on WhatsApp. Send STOP any time to turn them off.", msg.id);
      continue;
    }

    // Someone already enrolled (or a student's parent) writing in is not a
    // new enquiry — don't turn them into a lead. Their message does count as
    // agreeing to class reminders and updates on this number.
    if (await findStudentOrUserByPhone(phone)) {
      await recordInboundConsent(phone);
      console.log("[whatsapp] message from an existing student or user: recorded as consent, no lead");
      continue;
    }

    // Something WhatsApp couldn't pass on (often spam) stays in the inbox but
    // never becomes a lead.
    if (!createsLead(msg.type)) {
      console.log("[whatsapp] unsupported message: kept in the inbox, no lead created");
      continue;
    }

    const existing = await prisma.lead.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
    if (existing) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: { notes: `${existing.notes ?? ""}\n${note}`.trim() },
      });
    } else {
      await prisma.lead.create({
        data: { name: msg.name ?? phone, phone, source: "WHATSAPP", notes: note },
      });
    }
    changed = true;
  }

  if (changed) {
    revalidatePath("/admin/leads");
    revalidatePath("/admin");
  }
  if (inboxChanged) revalidatePath("/admin/whatsapp/inbox");
  // Always 200 once the signature checks out — a non-200 makes Meta retry.
  return new NextResponse("OK", { status: 200 });
}
