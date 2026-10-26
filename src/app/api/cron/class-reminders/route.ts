import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runClassReminders } from "@/lib/whatsapp-service";

// Called once a day at 10:00 IST by a cron entry on the server (see README),
// which sends the CRON_SECRET as a bearer token. Sends "your class is today"
// to every opted-in family with a class today. Running it twice is harmless:
// each message has a unique key, so nobody is messaged twice.
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
  const result = await runClassReminders();
  console.log("[cron] class reminders:", JSON.stringify(result));
  return NextResponse.json(result);
}
