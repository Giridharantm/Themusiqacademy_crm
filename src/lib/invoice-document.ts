import { prisma } from "@/lib/prisma";

// Everything the printable invoice needs, loaded the same way for the admin's
// copy and the learner's copy.
export async function getInvoiceForDocument(id: string) {
  const [invoice, courses] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        student: { include: { guardians: { include: { user: { select: { name: true, phone: true } } } } } },
        items: true,
        payments: { orderBy: { paidDate: "asc" } },
      },
    }),
    prisma.course.findMany({ select: { name: true } }),
  ]);
  return invoice ? { invoice, courseNames: courses.map((c) => c.name) } : null;
}

export type InvoiceForDocument = NonNullable<Awaited<ReturnType<typeof getInvoiceForDocument>>>["invoice"];
