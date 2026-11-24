-- A lead comment no longer needs a follow-up date: no date = a plain comment kept for reference.
-- Existing rows keep their dates.
-- AlterTable
ALTER TABLE "FollowUp" ALTER COLUMN "followUpDate" DROP NOT NULL;
