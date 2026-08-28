-- Invoice: add GST breakdown (amountWithoutGst/cgstAmount/sgstAmount), frozen
-- at creation time rather than derived from `total` on every render, so a
-- future GST-rate change can't silently rewrite a past invoice. Existing
-- invoices are backfilled from their current (already GST-inclusive) total,
-- 18% combined split evenly as 9% CGST + 9% SGST.
ALTER TABLE "Invoice" ADD COLUMN "amountWithoutGst" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "cgstAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "sgstAmount" REAL NOT NULL DEFAULT 0;

UPDATE "Invoice" SET
  "amountWithoutGst" = "total" / 1.18,
  "cgstAmount" = ("total" - "total" / 1.18) / 2,
  "sgstAmount" = ("total" - "total" / 1.18) / 2
WHERE "total" > 0;
