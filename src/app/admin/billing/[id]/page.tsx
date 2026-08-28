import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { recordPayment, cancelInvoice } from "@/lib/actions/billing-actions";
import { Card, CardBody, CardHeader, PageHeader, Badge, Input, Select, Button, EmptyState } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  PENDING: "yellow",
  PARTIAL: "blue",
  PAID: "green",
  OVERDUE: "red",
  CANCELLED: "slate",
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { student: true, items: true, payments: { orderBy: { paidDate: "desc" } } },
  });

  if (!invoice) notFound();

  const paidTotal = invoice.payments.reduce((s, p) => s + p.amount, 0);
  const balance = invoice.total - paidTotal;

  return (
    <div>
      <PageHeader
        title={invoice.invoiceNumber}
        subtitle={`${invoice.student.name} · Due ${format(invoice.dueDate, "d MMM yyyy")}`}
        action={<Badge color={statusColors[invoice.status]}>{invoice.status}</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Line items" />
            <ul className="divide-y divide-slate-100">
              {invoice.items.map((item) => (
                <li key={item.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <span className="text-slate-700">{item.description}</span>
                  <span className="text-slate-900 font-medium">Rs. {item.amount.toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
            <CardBody className="border-t border-slate-100 space-y-1">
              {invoice.discount > 0 && (
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Discount</span>
                  <span>- Rs. {invoice.discount.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold text-slate-900">
                <span>Total</span>
                <span>Rs. {invoice.total.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Paid</span>
                <span>Rs. {paidTotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-red-600">
                <span>Balance due</span>
                <span>Rs. {balance.toLocaleString("en-IN")}</span>
              </div>
            </CardBody>
            {invoice.notes && (
              <CardBody className="border-t border-slate-100">
                <p className="text-xs text-slate-500">{invoice.notes}</p>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="Fee details" subtitle="Post-discount amount, GST-inclusive" />
            <CardBody>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <p className="text-slate-500">Amount without GST</p>
                  <p className="text-slate-900 font-medium mt-0.5">Rs. {invoice.amountWithoutGst.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-slate-500">CGST (9%)</p>
                  <p className="text-slate-900 font-medium mt-0.5">Rs. {invoice.cgstAmount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-slate-500">SGST (9%)</p>
                  <p className="text-slate-900 font-medium mt-0.5">Rs. {invoice.sgstAmount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Total (incl. GST)</p>
                  <p className="text-slate-900 font-semibold mt-0.5">Rs. {invoice.total.toFixed(2)}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payment history" />
            {invoice.payments.length === 0 ? (
              <CardBody>
                <EmptyState text="No payments recorded yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="px-5 py-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="text-slate-900">Rs. {p.amount.toLocaleString("en-IN")} via {p.method.replace("_", " ")}</p>
                      {p.note && <p className="text-xs text-slate-400">{p.note}</p>}
                    </div>
                    <span className="text-xs text-slate-400">{format(p.paidDate, "d MMM yyyy")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6 print:hidden">
          <Card>
            <CardHeader title="Student" />
            <CardBody>
              <Link href={`/admin/students/${invoice.studentId}`} className="text-sm text-indigo-600 hover:underline font-medium">
                {invoice.student.name} &rarr;
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <PrintButton />
            </CardBody>
          </Card>

          {balance > 0 && invoice.status !== "CANCELLED" && (
            <Card>
              <CardHeader title="Record payment" />
              <CardBody>
                <form action={recordPayment.bind(null, invoice.id)} className="space-y-3">
                  <Input label="Amount (Rs.)" name="amount" type="number" min="0" step="0.01" defaultValue={balance} required />
                  <Select label="Method" name="method" defaultValue="CASH">
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="OTHER">Other</option>
                  </Select>
                  <Input label="Note" name="note" />
                  <Button type="submit" className="w-full">Record payment</Button>
                </form>
              </CardBody>
            </Card>
          )}

          {invoice.status !== "CANCELLED" && invoice.status !== "PAID" && (
            <Card>
              <CardBody>
                <form action={cancelInvoice.bind(null, invoice.id)}>
                  <Button type="submit" variant="danger" className="w-full">Cancel invoice</Button>
                </form>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
