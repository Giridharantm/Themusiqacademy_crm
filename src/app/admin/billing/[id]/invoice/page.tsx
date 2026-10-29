import { notFound } from "next/navigation";
import { getInvoiceForDocument } from "@/lib/invoice-document";
import { InvoicePrintView } from "@/components/invoice-document";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getInvoiceForDocument(id);
  if (!data) notFound();

  return <InvoicePrintView invoice={data.invoice} courseNames={data.courseNames} backHref={`/admin/billing/${id}`} backLabel="Back to invoice" />;
}
