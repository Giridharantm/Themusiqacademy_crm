-- AlterTable: WhatsApp delivery/read receipts for messages we sent
ALTER TABLE "WhatsAppMessage" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3);
