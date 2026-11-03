-- AlterTable
ALTER TABLE "WhatsAppSettings" ADD COLUMN     "autoSkipNo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "threeButtons" BOOLEAN NOT NULL DEFAULT false;
