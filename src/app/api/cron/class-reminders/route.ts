import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runScheduledReminders } from "@/lib/whatsapp-service";

// Called every few minutes by a cron entry on the server (see README), which
// sends the CRON_SECRET as a bearer token. Each call checks the reminder time
// set on the Reminders page and, once it has passed, sends "your class is today"
// to every opted-in family with a class today — once a day. Running it more
// often is harmless: it does nothing until due, and each message has a unique
// key, so nobody is messaged twice.
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });
  const result = await runScheduledReminders();
  // Most calls are "not due yet"; only log the ones that did something or have something to say.
  if (!("due" in result) && !(!result.ran && result.reason === "No classes today (Monday holiday)")) console.log("[cron] class reminders:", JSON.stringify(result));
  return NextResponse.json(result);
}
