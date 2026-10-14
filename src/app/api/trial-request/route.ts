import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseTrialRequest, looksLikeBot, createRateLimiter, leadNotes } from "@/lib/trial-request";

// Public endpoint behind the marketing website's "Book a trial class" form
// (themusiqacademy.com/trial/). Caddy forwards only this one path from the
// website's domain to the app, so the browser sees a same-origin request.
// It is deliberately unauthenticated — the guards are in lib/trial-request.ts
// (honeypot + minimum fill time) and the rate limiter below.
const limiter = createRateLimiter({ perKey: 5, global: 60, windowMs: 60 * 60 * 1000 });

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function clientIp(request: NextRequest) {
  // Caddy sets X-Forwarded-For to the real client address.
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

const reply = (body: { ok: boolean; error?: string }, status = 200) => NextResponse.json(body, { status });

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 5_000) return reply({ ok: false, error: "Request too large." }, 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, error: "Invalid request." }, 400);
  }

  // Automated submissions get a cheerful "ok" and are dropped, so a bot has
  // no signal telling it to adjust and try again.
  if (looksLikeBot(body)) return reply({ ok: true });

  if (!limiter.allow(clientIp(request))) {
    return reply({ ok: false, error: "Too many requests — please call or WhatsApp us instead." }, 429);
  }

  const courses = await prisma.course.findMany({ select: { id: true, name: true } });
  const parsed = parseTrialRequest(body, courses.map((c) => c.name));
  if (!parsed.ok) return reply({ ok: false, error: parsed.error }, 400);

  const { name, phone, email, interest } = parsed.value;
  const course = courses.find((c) => c.name === interest);
  const now = new Date();

  // The same person submitting twice (or the form being retried) shouldn't
  // create two leads — add the new detail to the existing one instead.
  const existing = await prisma.lead.findFirst({
    where: { phone, createdAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    await prisma.lead.update({
      where: { id: existing.id },
      data: { notes: `${existing.notes ?? ""}\nAsked again via the website form (${interest}) at ${now.toISOString().slice(0, 16).replace("T", " ")} UTC.`.trim() },
    });
  } else {
    await prisma.lead.create({
      data: {
        name,
        phone,
        email,
        source: "ONLINE",
        interestedCourseId: course?.id ?? null,
        notes: leadNotes(parsed.value, now),
      },
    });
  }

  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  return reply({ ok: true });
}
