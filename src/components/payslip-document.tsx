import Image from "next/image";
import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { COMPANY, amountInWords, invoiceDate, money } from "@/lib/invoice";
import { monthLabel } from "@/lib/expenses";
import { maskAccount, slipTotals } from "@/lib/payroll";
import type { PayslipForDocument } from "@/lib/payslip-document";

// The payslip as a printable A4 sheet, in the same style as the invoice: on
// screen a white page, printed the app's menu drops away and the sheet fills the
// paper. "Print / save as PDF" is how it is downloaded.
export function PayslipDocument({ slip }: { slip: PayslipForDocument }) {
  const pay = slip.teacher.teacherPay;
  const totals = slipTotals(slip.monthlySalary, slip.lines);
  const earnings = slip.lines.filter((l) => l.kind === "EARNING");
  const deductions = slip.lines.filter((l) => l.kind === "DEDUCTION");
  const daysInMonth = new Date(slip.year, slip.month, 0).getDate();
  const period = `1 – ${daysInMonth} ${monthLabel(slip.year, slip.month)}`;
  const account = maskAccount(pay?.bankAccount);

  const details: [string, string | null][] = [
    ["Employee", slip.teacher.name],
    ["Designation", pay?.designation ?? "Teacher"],
    ["Date of joining", pay?.joinedOn ? invoiceDate(pay.joinedOn) : null],
    ["PAN", pay?.pan ?? null],
    ["Bank account", account],
    ["Pay period", period],
    ["Paid on", slip.paidOn ? invoiceDate(slip.paidOn) : null],
  ];

  return (
    <div className="invoice-sheet mx-auto flex w-full max-w-[794px] flex-col overflow-hidden border border-line bg-white text-ink shadow-sm [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:min-h-[296mm] print:max-w-none print:border-0 print:shadow-none">
      <div className="flex flex-col gap-4 border-b-4 border-gold bg-brand px-6 py-6 text-page sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-9">
        <div className="flex min-w-0 items-center gap-5">
          <Image src="/logo-emblem-lg.png" alt="" width={120} height={120} priority className="h-[72px] w-[72px] shrink-0 sm:h-[96px] sm:w-[96px]" />
          <div>
            <p className="font-display text-lg font-bold leading-tight tracking-[0.05em] sm:text-xl">{COMPANY.legalName}</p>
            <p className="mt-1.5 text-[0.75rem] leading-[1.45] text-page/80">
              <span className="block">Trading as {COMPANY.tradingAs}</span>
              {COMPANY.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          </div>
        </div>
        <div className="sm:shrink-0 sm:text-right">
          <p className="whitespace-nowrap font-display text-xl tracking-[0.1em] text-gold">PAYSLIP</p>
          <p className="mt-1.5 text-base font-semibold">{monthLabel(slip.year, slip.month)}</p>
          {slip.status === "DRAFT" && <p className="mt-1 text-[0.75rem] font-semibold tracking-[0.1em] text-gold">DRAFT</p>}
        </div>
      </div>

      <div className="flex-1 px-6 pb-8 pt-7 sm:px-9">
        <div className="rounded-[10px] border border-line px-4 py-3.5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {details
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-32 shrink-0 text-muted">{k}</dt>
                  <dd className="font-medium text-ink">{v}</dd>
                </div>
              ))}
          </dl>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">Earnings</p>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-line">
                  <td className="py-2">Basic salary</td>
                  <td className="py-2 text-right tabular-nums">{money(totals.basic)}</td>
                </tr>
                {earnings.map((l) => (
                  <tr key={l.id} className="border-b border-line">
                    <td className="py-2">{l.label}</td>
                    <td className="py-2 text-right tabular-nums">{money(l.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-semibold">Gross earnings</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{money(totals.gross)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">Deductions</p>
            <table className="w-full text-sm">
              <tbody>
                {deductions.length === 0 && (
                  <tr className="border-b border-line">
                    <td className="py-2 text-muted">None</td>
                    <td className="py-2 text-right tabular-nums">{money(0)}</td>
                  </tr>
                )}
                {deductions.map((l) => (
                  <tr key={l.id} className="border-b border-line">
                    <td className="py-2">{l.label}</td>
                    <td className="py-2 text-right tabular-nums">{money(l.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-semibold">Total deductions</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{money(totals.deductions)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-7 rounded-[10px] border-2 border-brand px-5 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.12em]">Net pay</p>
            <p className="text-2xl font-bold tabular-nums">₹ {money(totals.net)}</p>
          </div>
          <p className="mt-1.5 text-[0.8rem] text-muted">{amountInWords(totals.net)}</p>
        </div>

        {slip.note && <p className="mt-5 text-sm text-muted">Note: {slip.note}</p>}

        <p className="mt-10 text-[0.75rem] text-muted">
          This is a computer-generated payslip and does not need a signature. Questions about it: {COMPANY.email} · {COMPANY.phone}
        </p>
      </div>
    </div>
  );
}

export function PayslipPrintView({ slip, backHref, backLabel }: { slip: PayslipForDocument; backHref: string; backLabel: string }) {
  return (
    <div>
      <style>{"@page { size: A4; margin: 0 } @media print { main { max-width: none !important; padding: 0 !important } }"}</style>
      <div className="mx-auto mb-4 flex max-w-[794px] items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="text-sm text-indigo-600 hover:underline">
          &larr; {backLabel}
        </Link>
        <PrintButton label="Download / print payslip" className="" variant="primary" />
      </div>
      <PayslipDocument slip={slip} />
    </div>
  );
}
