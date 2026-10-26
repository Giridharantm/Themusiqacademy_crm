-- CreateEnum
CREATE TYPE "NoticeType" AS ENUM ('TEACHER_LEAVE', 'TEACHER_LATE', 'RESCHEDULE', 'CLASS_CANCELLED', 'ACADEMY_LEAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "WhatsAppMessageKind" AS ENUM ('REMINDER', 'NOTICE', 'REPLY');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DRY_RUN');

-- CreateTable
CREATE TABLE "WhatsAppContact" (
    "phone" TEXT NOT NULL,
    "optedIn" BOOLEAN NOT NULL DEFAULT false,
    "optedInAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "source" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppContact_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "type" "NoticeType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "batchIds" TEXT[],
    "message" TEXT NOT NULL,
    "newDate" TIMESTAMP(3),
    "newStartTime" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "kind" "WhatsAppMessageKind" NOT NULL,
    "phone" TEXT NOT NULL,
    "studentId" TEXT,
    "noticeId" TEXT,
    "template" TEXT NOT NULL,
    "summary" TEXT,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "waMessageId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_dedupeKey_key" ON "WhatsAppMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_createdAt_idx" ON "WhatsAppMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
