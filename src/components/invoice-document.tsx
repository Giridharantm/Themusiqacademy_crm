import Image from "next/image";
import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { COMPANY, amountInWords, invoiceDate, itemEnrolment, money } from "@/lib/invoice";
import type { InvoiceForDocument } from "@/lib/invoice-document";

const METHOD_LABELS: Record<string, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

// The tax invoice as a printable A4 sheet. On screen it is a white page on the
// app background; printed, the app's menu drops away (the shell hides it) and
// the sheet fills the paper. Colours are forced on in print so the navy band
// survives "background graphics" being off.
export function InvoiceDocument({ invoice, courseNames }: { invoice: InvoiceForDocument; courseNames: string[] }) {
  const cancelled = invoice.status === "CANCELLED";
  const paid = invoice.payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(invoice.total - paid, 0);
  const subtotal = invoice.items.reduce((s, i) => s + i.amount, 0);

  const rows = invoice.items.map((item) => ({ item, e: itemEnrolment(item, courseNames) }));
  const enrolled = rows.filter((r) => r.e.instrument || r.e.planLabel);
  const hasPeriod = !!(invoice.periodStart && invoice.periodEnd);
  const periodText = hasPeriod ? `${invoiceDate(invoice.periodStart!)} – ${invoiceDate(invoice.periodEnd!)}` : null;

  const guardians = invoice.student.guardians.map((g) => g.user);
  const phones = Array.from(new Set([...guardians.map((g) => g.phone), invoice.student.phone].filter((p): p is string => !!p)));

  const stamp = cancelled
    ? { text: "CANCELLED", color: "border-red-700 text-red-700" }
    : invoice.status === "PAID"
      ? { text: "PAID", color: "border-emerald-700 text-emerald-700" }
      : paid > 0
        ? { text: "PART PAID", color: "border-amber-700 text-amber-700" }
        : { text: "UNPAID", color: "border-muted text-muted" };

  return (
    <div className="invoice-sheet mx-auto flex w-full max-w-[794px] flex-col overflow-hidden border border-line bg-white text-ink shadow-sm [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:min-h-[296mm] print:max-w-none print:border-0 print:shadow-none">
      <div className="flex flex-col gap-4 border-b-4 border-gold bg-brand px-6 py-6 text-page sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-9">
        <div className="flex min-w-0 items-center gap-5">
          <Image src="/logo-emblem-lg.png" alt="" width={120} height={120} priority className="h-[88px] w-[88px] shrink-0 sm:h-[120px] sm:w-[120px]" />
          <div>
            <p className="font-display text-lg font-bold leading-tight tracking-[0.05em] sm:text-xl">{COMPANY.legalName}</p>
            <p className="mt-1.5 text-[0.75rem] leading-[1.45] text-page/80">
              <span className="block">Trading as {COMPANY.tradingAs}</span>
              {COMPANY.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              GSTIN: {COMPANY.gstin} · {COMPANY.phone}
            </p>
          </div>
        </div>
        <div className="sm:shrink-0 sm:text-right">
          <p className="whitespace-nowrap font-display text-xl tracking-[0.1em] text-gold">TAX INVOICE</p>
          <p className="mt-1.5 text-base font-semibold">{invoice.invoiceNumber}</p>
          <p className="mt-0.5 text-[0.8rem] leading-relaxed text-page/80">
            Date: {invoiceDate(invoice.issueDate)}
            <br />
            Due: {invoiceDate(invoice.dueDate)}
          </p>
        </div>
      </div>

      <div className="flex-1 px-6 pb-8 pt-7 sm:px-9">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1 rounded-[10px] border border-line px-4 py-3.5">
            <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">Billed to</p>
            <p className="text-base font-semibold">{invoice.student.name}</p>
            <p className="mt-1 text-[0.8rem] leading-relaxed text-muted">
              Student ID: {invoice.student.studentCode}
              {guardians.length > 0 && (
                <>
                  <br />
                  Parent / guardian: {guardians.map((g) => g.name).join(", ")}
                </>
              )}
              {phones.length > 0 && (
                <>
                  <br />
                  {phones.join(", ")}
                </>
              )}
            </p>
          </div>

          {enrolled.length > 0 && (
            <div className="flex-1 rounded-[10px] border border-gold/50 bg-panel/60 px-4 py-3.5">
              <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">Enrolment</p>
              <div className="space-y-3">
                {enrolled.map(({ item, e }) => (
                  <div key={item.id}>
                    {e.instrument && <p className="text-base font-semibold">{e.instrument}</p>}
                    {(e.planLabel || e.classesLabel) && <p className="mt-0.5 text-[0.8rem] text-muted">{[e.planLabel, e.classesLabel].filter(Boolean).join(" · ")}</p>}
                    {e.validity && (
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border-[1.5px] border-gold bg-white px-3 py-2 text-[0.8rem]">
                        <span>
                          <b className="text-brand">Valid</b> {periodText ?? `for ${e.validity}`}
                        </span>
                        {periodText && <span className="whitespace-nowrap rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-gold">{e.validity}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-brand text-left text-[0.7rem] uppercase tracking-[0.1em] text-brand">
              <th className="w-[44%] px-1 py-2 font-semibold">Description</th>
              <th className="px-1 py-2 font-semibold">Instrument</th>
              <th className="px-1 py-2 font-semibold">Validity</th>
              <th className="px-1 py-2 text-right font-semibold">Amount (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, e }) => (
              <tr key={item.id} className="border-b border-line align-top">
                <td className="px-1 py-3">
                  <p className="font-semibold">{item.description}</p>
                  {(e.planLabel || e.classesLabel) && <p className="mt-0.5 text-xs text-muted">{[e.planLabel, e.classesLabel].filter(Boolean).join(" · ")}</p>}
                </td>
                <td className="px-1 py-3">{e.instrument ?? "–"}</td>
                <td className="px-1 py-3">
                  {e.validity ? (
                    <>
                      {periodText ?? `${e.validity} from start`}
                      {periodText && <p className="mt-0.5 text-xs text-muted">{e.validity}</p>}
                    </>
                  ) : (
                    periodText ?? "–"
                  )}
                </td>
                <td className="px-1 py-3 text-right">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 text-[0.8rem] leading-relaxed text-muted">
            <p>
              <b className="text-ink">Amount in words</b>
              <br />
              {amountInWords(invoice.total)}
            </p>
            <p className={`mt-3.5 inline-block -rotate-[4deg] rounded-lg border-[2.5px] px-4 py-1 text-lg font-bold tracking-[0.2em] ${stamp.color}`}>{stamp.text}</p>
            {invoice.notes && <p className="mt-3.5 whitespace-pre-line">{invoice.notes}</p>}
            <p className="mt-3.5">
              Place of supply: {COMPANY.stateName} ({COMPANY.stateCode})
            </p>
          </div>

          <div className="w-full text-sm sm:w-[310px]">
            {invoice.discount > 0 && (
              <>
                <SumRow label="Fees" value={money(subtotal)} />
                <SumRow label="Discount" value={`- ${money(invoice.discount)}`} />
              </>
            )}
            <SumRow label="Amount (excl. GST)" value={money(invoice.amountWithoutGst)} />
            <SumRow label="CGST @ 9%" value={money(invoice.cgstAmount)} />
            <SumRow label="SGST @ 9%" value={money(invoice.sgstAmount)} />
            <div className="my-2 flex justify-between rounded-lg bg-brand px-3.5 py-2.5 text-base font-bold text-white">
              <span>Total (incl. GST)</span>
              <span className="text-gold">Rs. {money(invoice.total)}</span>
            </div>
            {!cancelled && (
              <>
                {invoice.payments.map((p) => (
                  <div key={p.id} className="flex justify-between gap-3 py-1 text-emerald-700">
                    <span>
                      Paid · {METHOD_LABELS[p.method] ?? p.method} · {invoiceDate(p.paidDate)}
                    </span>
                    <span className="whitespace-nowrap">Rs. {money(p.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-1 font-semibold">
                  <span>Balance due</span>
                  <span>Rs. {money(balance)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line bg-panel px-6 py-3.5 text-xs text-muted sm:px-9">
        <span>This is a computer-generated invoice and does not require a signature.</span>
        <span>
          {COMPANY.email} · {COMPANY.website}
        </span>
      </div>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// The invoice page body shared by the admin's and the learner's copy: a small
// toolbar (hidden when printing) above the sheet, and A4 print settings.
export function InvoicePrintView({ invoice, courseNames, backHref, backLabel }: { invoice: InvoiceForDocument; courseNames: string[]; backHref: string; backLabel: string }) {
  return (
    <div>
      <style>{"@page { size: A4; margin: 0 } @media print { main { max-width: none !important; padding: 0 !important } }"}</style>
      <div className="mx-auto mb-4 flex max-w-[794px] items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="text-sm text-indigo-600 hover:underline">
          &larr; {backLabel}
        </Link>
        <PrintButton label="Print / save as PDF" className="" variant="primary" />
      </div>
      <InvoiceDocument invoice={invoice} courseNames={courseNames} />
    </div>
  );
}
