import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { addPayslipLine, deletePayslip, finalisePayslip, removePayslipLine, reopenPayslip, updatePayslipDetails } from "@/lib/actions/payroll-actions";
import { getPayslipForDocument } from "@/lib/payslip-document";
import { istDateString } from "@/lib/whatsapp-notices";
import { monthKey, monthLabel } from "@/lib/expenses";
import { slipTotals } from "@/lib/payroll";
import { money } from "@/lib/invoice";
import { Card, CardBody, CardHeader, PageHeader, Badge, Button, Input, Select, Textarea } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export default async function PayslipEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;
  const sp = await searchParams;
  const slip = await getPayslipForDocument(id);
  if (!slip) notFound();

  const totals = slipTotals(slip.monthlySalary, slip.lines);
  const draft = slip.status === "DRAFT";

  return (
    <div>
      <PageHeader
        title={`${slip.teacher.name} · ${monthLabel(slip.year, slip.month)}`}
        subtitle="Payslip"
        action={
          <Link href={`/admin/payroll?month=${monthKey(slip.year, slip.month)}`} className="text-sm text-indigo-600 hover:underline">
            Back to payroll
          </Link>
        }
      />
      {sp.error && <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{sp.error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title="Pay for the month"
              action={<Badge color={draft ? "yellow" : "green"}>{draft ? "Draft: only you can see it" : "Final: the teacher can download it"}</Badge>}
            />
            <CardBody>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2">Basic salary</td>
                    <td className="py-2 text-right tabular-nums">₹ {money(totals.basic)}</td>
                    <td className="w-20" />
                  </tr>
                  {slip.lines.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100">
                      <td className="py-2">
                        {l.label} <span className="text-xs text-slate-400">{l.kind === "EARNING" ? "earning" : "deduction"}</span>
                      </td>
                      <td className={`py-2 text-right tabular-nums ${l.kind === "DEDUCTION" ? "text-red-700" : ""}`}>
                        {l.kind === "DEDUCTION" ? "− " : "+ "}₹ {money(l.amount)}
                      </td>
                      <td className="py-2 text-right">
                        {draft && (
                          <form action={removePayslipLine.bind(null, l.id)}>
                            <button type="submit" className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="pt-3 font-semibold">Net pay</td>
                    <td className="pt-3 text-right text-base font-semibold tabular-nums">₹ {money(totals.net)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-xs text-slate-500">
                Gross ₹ {money(totals.gross)} less deductions ₹ {money(totals.deductions)}
              </p>
            </CardBody>
          </Card>

          {draft && (
            <Card>
              <CardHeader title="Add a line" subtitle="An extra earning (incentive, bonus) or a deduction (TDS, advance recovered, leave cut)" />
              <CardBody>
                <form action={addPayslipLine.bind(null, id)} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <Input label="Name" name="label" required placeholder="e.g. TDS" />
                  </div>
                  <Input label="Amount (₹)" name="amount" type="number" min="0.01" step="0.01" required />
                  <Select label="Type" name="kind" defaultValue="DEDUCTION">
                    <option value="EARNING">Earning (adds)</option>
                    <option value="DEDUCTION">Deduction (takes off)</option>
                  </Select>
                  <div className="sm:col-span-4">
                    <Button type="submit" variant="secondary">Add line</Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {draft ? (
            <>
              <Card>
                <CardHeader title="This month's basic" subtitle="Change it for a part month or a one-off; it doesn't change their regular salary" />
                <CardBody>
                  <form action={updatePayslipDetails.bind(null, id)} className="space-y-3">
                    <Input label="Basic for this month (₹)" name="monthlySalary" type="number" min="0" step="0.01" required defaultValue={slip.monthlySalary} />
                    <Textarea label="Note on the slip (optional)" name="note" defaultValue={slip.note ?? ""} placeholder="e.g. Includes Diwali incentive" />
                    <Button type="submit" variant="secondary" className="w-full">Save</Button>
                  </form>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Finalise and pay" subtitle="The teacher can then download the slip, and the net pay is added to expenses as Salaries" />
                <CardBody>
                  <form action={finalisePayslip.bind(null, id)} className="space-y-3">
                    <Input label="Date paid" name="paidOn" type="date" required defaultValue={slip.paidOn ? slip.paidOn.toISOString().slice(0, 10) : istDateString(new Date())} />
                    <Select label="Paid by" name="method" defaultValue="BANK_TRANSFER">
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="UPI">UPI</option>
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="OTHER">Other</option>
                    </Select>
                    <ConfirmSubmitButton variant="primary" confirmMessage={`Finalise this slip and record ₹ ${money(totals.net)} as salary paid to ${slip.teacher.name}? The teacher will be able to download it.`}>
                      Finalise slip
                    </ConfirmSubmitButton>
                  </form>
                </CardBody>
              </Card>

              <form action={deletePayslip.bind(null, id)}>
                <ConfirmSubmitButton confirmMessage="Delete this draft slip?">Delete draft</ConfirmSubmitButton>
              </form>
            </>
          ) : (
            <Card>
              <CardHeader title="Paid" />
              <CardBody className="space-y-3 text-sm">
                <p>
                  ₹ {money(slip.netPay)} paid {slip.paidOn ? `on ${slip.paidOn.toISOString().slice(0, 10)}` : ""}. It is counted under Salaries in that month&apos;s expenses.
                </p>
                <Link href={`/admin/payroll/${id}/slip`} className="inline-block text-indigo-600 hover:underline">
                  Open the printable slip
                </Link>
                <form action={reopenPayslip.bind(null, id)}>
                  <ConfirmSubmitButton confirmMessage="Reopen this slip? The teacher will no longer see it and its salary entry is taken out of the expenses until you finalise it again.">
                    Reopen to correct
                  </ConfirmSubmitButton>
                </form>
              </CardBody>
            </Card>
          )}
          {draft && (
            <Link href={`/admin/payroll/${id}/slip`} className="block text-sm text-indigo-600 hover:underline">
              Preview the printable slip
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
