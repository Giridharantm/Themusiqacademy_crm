import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getPayslipForDocument } from "@/lib/payslip-document";
import { PayslipPrintView } from "@/components/payslip-document";

// Only your own slip, and only once it is final. Anyone else's id, or a draft,
// is simply "not found".
export default async function TeacherPayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("TEACHER");
  const { id } = await params;
  const slip = await getPayslipForDocument(id);
  if (!slip || slip.teacherId !== user.id || slip.status !== "FINAL") notFound();
  return <PayslipPrintView slip={slip} backHref="/teacher/payslips" backLabel="Back to payslips" />;
}
