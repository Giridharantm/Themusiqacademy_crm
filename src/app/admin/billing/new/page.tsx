import { prisma } from "@/lib/prisma";
import { createInvoice } from "@/lib/actions/billing-actions";
import { Card, CardBody, CardHeader, PageHeader, Input, Select, Textarea, Button } from "@/components/ui";
import { InvoiceItemsFields } from "@/components/invoice-items-fields";
import { DISCOUNT_STEPS } from "@/lib/subscription";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  const { studentId } = await searchParams;

  const [students, selectedStudent] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    studentId
      ? prisma.student.findUnique({
          where: { id: studentId },
          include: { enrollments: { include: { batch: { include: { course: true } } }, where: { status: "ACTIVE" } } },
        })
      : null,
  ]);

  const defaultDescription = selectedStudent?.enrollments[0]
    ? `${selectedStudent.enrollments[0].batch.course.name} fee`
    : undefined;

  return (
    <div>
      <PageHeader title="New invoice" subtitle="Raise a fee invoice for a student" />

      <Card className="max-w-2xl">
        <CardHeader title="Invoice details" />
        <CardBody>
          <form action={createInvoice} className="space-y-4">
            <Select label="Student" name="studentId" required defaultValue={studentId ?? ""}>
              <option value="" disabled>Select a student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.studentCode}){s.phone ? ` · ${s.phone}` : ""}</option>
              ))}
            </Select>

            <InvoiceItemsFields defaultDescription={defaultDescription} />

            <div className="grid grid-cols-2 gap-3">
              <Select label="Discount (Rs.)" name="discount" defaultValue="0">
                <option value="0">No discount</option>
                {DISCOUNT_STEPS.map((d) => (
                  <option key={d} value={d}>Rs. {d.toLocaleString("en-IN")}</option>
                ))}
              </Select>
              <Input label="Due date" name="dueDate" type="date" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Billing period start" name="periodStart" type="date" />
              <Input label="Billing period end" name="periodEnd" type="date" />
            </div>
            <Textarea label="Notes" name="notes" />
            <Button type="submit" className="w-full">Create invoice</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
