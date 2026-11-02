import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getPayslipForDocument } from "@/lib/payslip-document";
import { PayslipPrintView } from "@/components/payslip-document";

export default async function AdminPayslipPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;
  const slip = await getPayslipForDocument(id);
  if (!slip) notFound();
  return <PayslipPrintView slip={slip} backHref={`/admin/payroll/${id}`} backLabel="Back to the slip" />;
}
