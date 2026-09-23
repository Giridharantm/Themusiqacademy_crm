import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { markStudentPresent, getOrCreateAttendanceKioskUser } from "@/lib/attendance";
import { dayCodeFromDate } from "@/lib/schedule";
import { format } from "date-fns";

// A machine-to-machine endpoint for automated check-in — a face-recognition
// kiosk tablet, an n8n flow, a third-party attendance service's webhook.
// Authenticated by a shared secret (ATTENDANCE_API_KEY), not a NextAuth
// session, since the caller is never a logged-in browser user.
//
// Deliberately student-identified, not course-identified: the caller only
// ever knows "this student just walked in," not which of their instruments
// today's class is for. Course is inferred from whichever of the student's
// ACTIVE enrollments has a batch scheduled on today's day of week — pass an
// explicit courseId to mark a specific instrument instead (a comp/reschedule
// class, or a student with two instruments scheduled the same day).
export async function POST(request: NextRequest) {
  const apiKey = process.env.ATTENDANCE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Attendance check-in is not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const providedKey = authHeader.replace(/^Bearer\s+/i, "");
  if (providedKey !== apiKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const studentCode = String(body?.studentCode ?? "").trim();
  const explicitCourseId = String(body?.courseId ?? "").trim() || null;
  if (!studentCode) {
    return NextResponse.json({ ok: false, error: "studentCode is required" }, { status: 400 });
  }

  const timestamp = body?.timestamp ? new Date(body.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid timestamp" }, { status: 400 });
  }

  const student = await prisma.student.findUnique({
    where: { studentCode },
    include: { enrollments: { where: { status: "ACTIVE" }, include: { batch: true } } },
  });

  if (!student) {
    return NextResponse.json({ ok: false, error: "Student not found" }, { status: 404 });
  }
  if (student.status !== "ACTIVE") {
    return NextResponse.json({ ok: false, error: "Student is marked inactive" }, { status: 409 });
  }

  const todaysCourseIds = explicitCourseId
    ? [explicitCourseId]
    : Array.from(
        new Set(
          student.enrollments
            .filter((e) => e.batch.dayOfWeek === dayCodeFromDate(timestamp))
            .map((e) => e.batch.courseId)
        )
      );

  if (todaysCourseIds.length === 0) {
    return NextResponse.json({ ok: true, marked: false, message: "No class scheduled for this student today" });
  }

  const [courses, kioskUser] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: todaysCourseIds } } }),
    getOrCreateAttendanceKioskUser(),
  ]);

  const dateStr = format(timestamp, "yyyy-MM-dd");
  for (const courseId of todaysCourseIds) {
    await markStudentPresent(student.id, courseId, dateStr, kioskUser.id);
  }

  return NextResponse.json({
    ok: true,
    marked: true,
    student: student.name,
    studentCode: student.studentCode,
    courses: courses.map((c) => c.name),
    date: dateStr,
  });
}
