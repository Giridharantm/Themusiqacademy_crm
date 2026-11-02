import { prisma } from "@/lib/prisma";

// Everything the printable payslip needs, loaded the same way for the admin's
// copy and the teacher's copy.
export async function getPayslipForDocument(id: string) {
  return prisma.payslip.findUnique({
    where: { id },
    include: { lines: { orderBy: { createdAt: "asc" } }, teacher: { include: { teacherPay: true } } },
  });
}

export type PayslipForDocument = NonNullable<Awaited<ReturnType<typeof getPayslipForDocument>>>;
