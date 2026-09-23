import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Backs the kiosk app's enrollment picker — a plain {studentCode, name} list
// so an admin enrolling a student's face doesn't have to know or type their
// exact student ID. Same bearer-key auth as /checkin, since the caller is
// the same kiosk app, never a logged-in browser user. Only ACTIVE students:
// there's no reason to enroll someone who shouldn't be attending anything.
export async function GET(request: NextRequest) {
  const apiKey = process.env.ATTENDANCE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Attendance check-in is not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const providedKey = authHeader.replace(/^Bearer\s+/i, "");
  if (providedKey !== apiKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { studentCode: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ ok: true, students });
}
