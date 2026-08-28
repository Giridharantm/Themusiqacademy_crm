import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { Card, CardBody, PageHeader, Badge, EmptyState } from "@/components/ui";

export default async function ParentDashboard() {
  const user = await requireRole("PARENT");

  const links = await prisma.studentGuardian.findMany({
    where: { userId: user.id },
    include: {
      student: {
        include: { enrollments: { include: { batch: { include: { course: true } } } } },
      },
    },
  });

  return (
    <div>
      <PageHeader title="My Children" subtitle="View classes, attendance and fees" />

      {links.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState text="No students linked to your account yet. Please contact the academy office." />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {links.map(({ student }) => (
            <Link key={student.id} href={`/parent/students/${student.id}`}>
              <Card className="hover:border-indigo-300 transition-colors">
                <CardBody>
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                    <Badge color={student.status === "ACTIVE" ? "green" : "slate"}>{student.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {student.enrollments.length === 0
                      ? "Not enrolled in any batch"
                      : student.enrollments.map((e) => e.batch.name).join(", ")}
                  </p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
