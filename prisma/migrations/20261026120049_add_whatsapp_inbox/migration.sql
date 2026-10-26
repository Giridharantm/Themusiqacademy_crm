-- AlterEnum
ALTER TYPE "WhatsAppMessageKind" ADD VALUE 'INBOUND';

-- AlterEnum
ALTER TYPE "WhatsAppMessageStatus" ADD VALUE 'RECEIVED';

-- AlterTable
ALTER TABLE "WhatsAppContact" ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "lastReadAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppMessage" ADD COLUMN     "body" TEXT;

-- CreateIndex
CREATE INDEX "WhatsAppMessage_phone_createdAt_idx" ON "WhatsAppMessage"("phone", "createdAt");
