import { prisma } from "@/lib/prisma";
import { seatLimit } from "@/lib/reschedule";
import { DAY_LABELS, formatTimeLabel } from "@/lib/schedule";

// Active students on each class's regular roster — what the limit is held
// against when someone is enrolled. (Per-date seats, with skips and make-ups,
// are in class-changes.ts.)
export async function rosterCounts(batchIds?: string[]): Promise<Map<string, number>> {
  const rows = await prisma.enrollment.groupBy({
    by: ["batchId"],
    where: { status: "ACTIVE", student: { status: "ACTIVE" }, ...(batchIds ? { batchId: { in: batchIds } } : {}) },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.batchId, r._count._all]));
}

// A message when this class is already at its limit, else null. Front desk is
// stopped by it; the admin can still go over.
export async function fullClassMessage(batchId: string): Promise<string | null> {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, include: { course: true } });
  if (!batch) return null;
  const limit = seatLimit(batch, batch.course);
  if (limit === null) return null;
  const count = (await rosterCounts([batchId])).get(batchId) ?? 0;
  if (count < limit) return null;
  return `${batch.course.name} on ${DAY_LABELS[batch.dayOfWeek]} at ${formatTimeLabel(batch.startTime)} is full (${count} of ${limit}). Choose another class, or ask the admin.`;
}
