import { NextRequest } from "next/server";
import { requireRole } from "@/lib/authz";
import { getStudentList, studentListColumns } from "@/lib/student-list";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: NextRequest) {
  await requireRole("ADMIN");
  const { searchParams } = new URL(request.url);
  const { students, relevantSubs } = await getStudentList({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    courseId: searchParams.get("courseId") ?? undefined,
    renewal: searchParams.get("renewal") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
  });
  const csv = toCsv(students, studentListColumns(relevantSubs));
  return csvResponse(`students-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
