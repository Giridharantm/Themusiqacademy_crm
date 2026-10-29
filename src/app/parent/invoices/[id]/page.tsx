import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { getInvoiceForDocument } from "@/lib/invoice-document";
import { InvoicePrintView } from "@/components/invoice-document";

export default async function ParentInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("PARENT");
  const { id } = await params;

  const data = await getInvoiceForDocument(id);
  if (!data) notFound();

  // Only the learner's own guardians may open it — same rule as the student page.
  const link = await prisma.studentGuardian.findUnique({
    where: { studentId_userId: { studentId: data.invoice.studentId, userId: user.id } },
  });
  if (!link) notFound();

  return <InvoicePrintView invoice={data.invoice} courseNames={data.courseNames} backHref={`/parent/students/${data.invoice.studentId}`} backLabel="Back" />;
}
