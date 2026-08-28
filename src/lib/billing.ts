// Line item prices (PLAN_INVOICE_AMOUNTS) are GST-inclusive — 18% combined,
// split evenly as 9% CGST + 9% SGST for an intra-state invoice. The
// breakdown is computed once at invoice-creation time and stored on the
// Invoice row (not recalculated from `total` on every render), so a future
// GST-rate change can't silently rewrite a past invoice's tax breakdown.
export const GST_RATE = 0.18;

export function splitGst(totalInclusive: number) {
  const amountWithoutGst = totalInclusive / (1 + GST_RATE);
  const gstTotal = totalInclusive - amountWithoutGst;
  return {
    amountWithoutGst,
    cgstAmount: gstTotal / 2,
    sgstAmount: gstTotal / 2,
  };
}
