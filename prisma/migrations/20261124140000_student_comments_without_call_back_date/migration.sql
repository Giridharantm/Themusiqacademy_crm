-- A student comment no longer needs a call-back date: no date = a plain comment kept for reference.
-- Existing rows keep their dates.
-- AlterTable
ALTER TABLE "StudentFollowUp" ALTER COLUMN "followUpDate" DROP NOT NULL;
