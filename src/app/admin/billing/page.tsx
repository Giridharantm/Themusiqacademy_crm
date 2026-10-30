import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/authz";
import { Card, CardBody, CardHeader, PageHeader, Badge, EmptyState, StatCard } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { normalizeSearchQuery } from "@/lib/search";
import { paidInvoiceRevenue } from "@/lib/billing";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  PENDING: "yellow",
  PARTIAL: "blue",
  PAID: "green",
  OVERDUE: "red",
  CANCELLED: "slate",
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const isAdmin = (await currentUser())?.role === "ADMIN";
  const q = normalizeSearchQuery((await searchParams).q);

  const invoices = await prisma.invoice.findMany({
    where: q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: "insensitive" } },
            { student: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined,
    include: { student: true, payments: true },
    orderBy: { issueDate: "desc" },
  });

  const pendingTotal = invoices
    .filter((i) => i.status === "PENDING" || i.status === "PARTIAL" || i.status === "OVERDUE")
    .reduce((sum, i) => sum + (i.total - i.payments.reduce((s, p) => s + p.amount, 0)), 0);
  const now = new Date();
  const revenueThisMonth = paidInvoiceRevenue(
    invoices,
    new Date(now.getFullYear(), now.getMonth(), 1),
    new Date(now.getFullYear(), now.getMonth() + 1, 1)
  );

  return (
    <div>
      <PageHeader
        title="Billing & Invoices"
        subtitle="Track fees, dues and payments — invoices are raised by recording a payment on a student's subscription"
        action={<SearchBox placeholder="Search invoices..." defaultValue={q} />}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard label="Outstanding dues" value={`Rs. ${pendingTotal.toLocaleString("en-IN")}`} />
        {isAdmin && <StatCard label="Revenue this month" value={`Rs. ${revenueThisMonth.toLocaleString("en-IN")}`} hint="Paid invoices raised this month" />}
      </div>

      <Card>
        {invoices.length === 0 ? (
          <CardBody>
            <EmptyState text={q ? "No invoices match your search" : "No invoices raised yet"} />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invoices.map((inv) => {
              const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
              return (
                <li key={inv.id}>
                  <Link href={`/admin/billing/${inv.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{inv.invoiceNumber} · {inv.student.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Due {format(inv.dueDate, "d MMM yyyy")} · Rs. {paid.toLocaleString("en-IN")} of {inv.total.toLocaleString("en-IN")} paid
                      </p>
                    </div>
                    <Badge color={statusColors[inv.status]}>{inv.status}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
