"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { parseDateOnly } from "@/lib/attendance";
import { istDateString } from "@/lib/whatsapp-notices";
import { parseEntry } from "@/lib/teacher-attendance";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireActiveTeacher(teacherId: string) {
  const teacher = await prisma.user.findFirst({ where: { id: teacherId, role: "TEACHER", status: "ACTIVE" }, select: { id: true } });
  if (!teacher) throw new Error("Teacher not found");
}

function revalidateTeacherAttendance() {
  revalidatePath("/admin/teacher-attendance");
  revalidatePath("/teacher/my-attendance");
}

const backTo = (date: string, extra: Record<string, string> = {}) => `/admin/teacher-attendance?${new URLSearchParams({ date, ...extra })}`;

// Marks (or corrects) one teacher's attendance for a day: present with the time
// they came in, or absent, plus a note. One record per teacher per day, so
// saving again simply replaces it. A bad entry bounces back with the reason
// rather than throwing, since this is typed in by hand.
export async function markTeacherAttendance(teacherId: string, formData: FormData) {
  const user = await requireRole("ADMIN", "FRONT_DESK");
  await requireActiveTeacher(teacherId);

  const raw = {
    date: String(formData.get("date") ?? ""),
    status: String(formData.get("status") ?? ""),
    time: String(formData.get("time") ?? ""),
    note: String(formData.get("note") ?? ""),
  };
  const parsed = parseEntry(raw, istDateString(new Date()));
  if (!parsed.ok) redirect(backTo(raw.date, { error: parsed.error, teacher: teacherId }));

  const { date: dateStr, status, time, note } = parsed.entry;
  const date = parseDateOnly(dateStr);
  await prisma.teacherAttendance.upsert({
    where: { teacherId_date: { teacherId, date } },
    update: { status, time, note, markedById: user.id },
    create: { teacherId, date, status, time, note, markedById: user.id },
  });

  revalidateTeacherAttendance();
  redirect(backTo(dateStr, { saved: teacherId }));
}

// Takes a day's mark off again (marked the wrong teacher, or the wrong day).
export async function clearTeacherAttendance(teacherId: string, formData: FormData) {
  await requireRole("ADMIN", "FRONT_DESK");
  const dateStr = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("Date is required");

  await prisma.teacherAttendance.deleteMany({ where: { teacherId, date: parseDateOnly(dateStr) } });

  revalidateTeacherAttendance();
  redirect(backTo(dateStr));
}
