-- AlterEnum
ALTER TYPE "NoticeType" ADD VALUE 'COMP_CLASS';

-- AlterTable
ALTER TABLE "WhatsAppSettings" ADD COLUMN     "lastAutoRunDate" TEXT,
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "lastRunSummary" TEXT,
ADD COLUMN     "reminderTime" TEXT NOT NULL DEFAULT '10:00';
