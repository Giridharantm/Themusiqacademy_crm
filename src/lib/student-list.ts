import { prisma } from "@/lib/prisma";
import { normalizeSearchQuery, phoneSearchDigits } from "@/lib/search";
import { subscriptionTotals, countUsedClasses, attendanceForSubscription, renewalUrgency } from "@/lib/subscription";
import type { CsvColumn } from "@/lib/csv";
import { format } from "date-fns";

export type StudentListFilters = {
  q?: string;
  status?: string;
  courseId?: string;
  renewal?: string;
  sort?: string;
};

// No status in the URL at all (a fresh visit) defaults to Active only —
// inactive students shouldn't clutter the default view. "ALL" is the
// filter's explicit "show inactive too" choice, distinct from that
// default; it must survive round-tripping through the search box's hidden
// fields, which is why it isn't just an empty string (those get dropped).
function resolveStatus(status: string | undefined) {
  return status === undefined ? "ACTIVE" : status === "ALL" ? undefined : status;
}

// The Students page and its CSV download both come through here, so the
// file always contains exactly the rows (and order) the page is showing.
export async function getStudentList(filters: StudentListFilters) {
  const { q: rawQ, status, courseId, renewal, sort } = filters;
  const q = normalizeSearchQuery(rawQ);
  const phoneDigits = q ? phoneSearchDigits(q) : undefined;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const studentsRaw = await prisma.student.findMany({
    where: {
      status: resolveStatus(status),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
              { email: { contains: q, mode: "insensitive" } },
              { studentCode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(courseId ? { enrollments: { some: { batch: { courseId } } } } : {}),
    },
    include: {
      enrollments: { include: { batch: { include: { course: true } } } },
      subscriptions: { where: { status: "ACTIVE" }, include: { course: true, bonusGrants: true } },
      guardians: { include: { user: true } },
      attendance: true,
    },
    orderBy: { name: "asc" },
  });

  // Resolve each active subscription's live remaining-classes/urgency/expiry
  // once per student, so filtering, sorting and the row display all agree.
  const students = studentsRaw.map((s) => {
    const subs = s.subscriptions.map((sub) => {
      const courseAttendance = s.attendance.filter((a) => a.courseId === sub.courseId);
      const used = countUsedClasses(attendanceForSubscription(sub.startDate, courseAttendance));
      const totals = subscriptionTotals(sub, used);
      return {
        courseName: sub.course.name,
        endDate: sub.endDate,
        totalClasses: totals.totalClasses,
        used: totals.used,
        remaining: totals.remaining,
        urgency: renewalUrgency(totals.remaining),
        inThisMonth: !!sub.endDate && sub.endDate >= monthStart && sub.endDate < monthEnd,
      };
    });
    return { ...s, subs };
  });

  type Row = (typeof students)[number];
  type Sub = Row["subs"][number];

  function matchesRenewalFilter(sub: Sub) {
    if (renewal === "this-month") return sub.inThisMonth;
    if (renewal === "under6") return sub.remaining < 6;
    if (renewal === "soon") return sub.urgency === "soon";
    if (renewal === "due") return sub.urgency === "due";
    return true;
  }

  let filtered = renewal ? students.filter((s) => s.subs.some(matchesRenewalFilter)) : students;

  // When a renewal filter is on, only show the subscriptions that actually
  // matched it — otherwise a student with one overdue and one healthy
  // subscription would bury the reason they're in the list.
  const relevantSubs = (s: Row) => (renewal ? s.subs.filter(matchesRenewalFilter) : s.subs);

  if (sort === "joined") {
    filtered = [...filtered].sort((a, b) => b.joinDate.getTime() - a.joinDate.getTime());
  } else if (sort === "renewal") {
    filtered = [...filtered].sort((a, b) => {
      const aDate = Math.min(...relevantSubs(a).map((sub) => sub.endDate?.getTime() ?? Infinity), Infinity);
      const bDate = Math.min(...relevantSubs(b).map((sub) => sub.endDate?.getTime() ?? Infinity), Infinity);
      return aDate - bDate;
    });
  } else if (sort === "remaining") {
    filtered = [...filtered].sort((a, b) => {
      const aMin = Math.min(...relevantSubs(a).map((sub) => sub.remaining), Infinity);
      const bMin = Math.min(...relevantSubs(b).map((sub) => sub.remaining), Infinity);
      return aMin - bMin;
    });
  }

  return { students: filtered, relevantSubs };
}

export type StudentListData = Awaited<ReturnType<typeof getStudentList>>;
export type StudentListRow = StudentListData["students"][number];

// The columns mirror what the list shows (subscription progress and renewal
// date included — that's what makes it useful for renewal follow-up calls),
// plus the guardian contact, since for children that's who you actually ring.
// "Classes left" and "Next renewal" are single numbers/ISO dates, not prose,
// so the sheet can be sorted on them.
export function studentListColumns(relevantSubs: StudentListData["relevantSubs"]): CsvColumn<StudentListRow>[] {
  return [
    { key: "studentCode", label: "Student ID", value: (s) => s.studentCode },
    { key: "name", label: "Name", value: (s) => s.name },
    { key: "status", label: "Status", value: (s) => s.status },
    { key: "gender", label: "Gender", value: (s) => s.gender ?? "" },
    { key: "dob", label: "Date of birth", value: (s) => (s.dob ? s.dob.toISOString().slice(0, 10) : "") },
    { key: "phone", label: "Phone", value: (s) => s.phone ?? "" },
    { key: "email", label: "Email", value: (s) => s.email ?? "" },
    { key: "address", label: "Address", value: (s) => s.address ?? "" },
    { key: "guardianName", label: "Guardian name", value: (s) => s.guardians.map((g) => g.user.name).join("; ") },
    { key: "guardianRelation", label: "Guardian relation", value: (s) => s.guardians.map((g) => g.relation).join("; ") },
    { key: "guardianPhone", label: "Guardian phone", value: (s) => s.guardians.map((g) => g.user.phone ?? "").join("; ") },
    { key: "guardianEmail", label: "Guardian email", value: (s) => s.guardians.map((g) => g.user.email).join("; ") },
    { key: "joinDate", label: "Joined", value: (s) => s.joinDate.toISOString().slice(0, 10) },
    { key: "instruments", label: "Instruments", value: (s) => Array.from(new Set(s.enrollments.map((e) => e.batch.course.name))).join("; ") },
    { key: "batches", label: "Batches", value: (s) => s.enrollments.map((e) => e.batch.name).join("; ") },
    {
      key: "subscriptions",
      label: "Subscriptions",
      value: (s) =>
        relevantSubs(s)
          .map((sub) => `${sub.courseName}: ${sub.used} of ${sub.totalClasses} used, ${sub.remaining} left${sub.endDate ? `, renews ${format(sub.endDate, "d MMM yyyy")}` : ""}`)
          .join("; "),
    },
    {
      key: "classesLeft",
      label: "Classes left",
      value: (s) => {
        const subs = relevantSubs(s);
        return subs.length ? Math.min(...subs.map((sub) => sub.remaining)) : "";
      },
    },
    {
      key: "nextRenewal",
      label: "Next renewal",
      value: (s) => {
        const dates = relevantSubs(s).flatMap((sub) => (sub.endDate ? [sub.endDate.getTime()] : []));
        return dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : "";
      },
    },
  ];
}
