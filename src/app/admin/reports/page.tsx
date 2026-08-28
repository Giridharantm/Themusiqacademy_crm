import Link from "next/link";
import { Card, CardBody, PageHeader } from "@/components/ui";

const reports = [
  { href: "/admin/reports/students", title: "Students", description: "Every student's details, enrollments and status — filter by instrument, status, gender and join date." },
  { href: "/admin/reports/leads", title: "Leads", description: "Enquiries by status, source and instrument, with follow-up and conversion history." },
  { href: "/admin/reports/attendance", title: "Attendance", description: "Attendance records by instrument and date range, one row per student per class." },
  { href: "/admin/reports/invoices", title: "Invoices & tax", description: "Invoices with the GST breakdown (amount without GST, CGST, SGST) needed to file monthly tax — defaults to the current month." },
];

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Filter and download data as CSV" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {reports.map((r) => (
          <Link key={r.href} href={r.href} className="block h-full">
            <Card className="h-full hover:border-indigo-300 hover:shadow-md transition-shadow">
              <CardBody>
                <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                <p className="text-xs text-slate-500 mt-1">{r.description}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
