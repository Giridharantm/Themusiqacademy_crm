import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  verifySignature,
  parseInboundMessages,
  leadPhoneFromWhatsApp,
  whatsappNote,
  createSeenIds,
} from "@/lib/whatsapp";

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
  if (!appSecret) return new NextResponse("Not configured", { status: 503 });

  const raw = await request.text();
  if (raw.length > 200_000) return new NextResponse("Too large", { status: 413 });
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const now = new Date();
  let changed = false;

  for (const msg of parseInboundMessages(payload)) {
    if (!seen.add(msg.id)) continue;
    const phone = leadPhoneFromWhatsApp(msg.from);
    const note = whatsappNote(msg.text, now);

    // Someone already enrolled (or a student's parent) writing in is not a
    // new enquiry — don't turn them into a lead.
    const [student, user] = await Promise.all([
      prisma.student.findFirst({ where: { phone }, select: { id: true } }),
      prisma.user.findFirst({ where: { phone }, select: { id: true } }),
    ]);
    if (student || user) continue;

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
  // Always 200 once the signature checks out — a non-200 makes Meta retry.
  return new NextResponse("OK", { status: 200 });
}
