-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "remindersOff" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReminderSkip" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderSkip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "remindersPaused" BOOLEAN NOT NULL DEFAULT false,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,

    CONSTRAINT "WhatsAppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReminderSkip_studentId_date_key" ON "ReminderSkip"("studentId", "date");

-- AddForeignKey
ALTER TABLE "ReminderSkip" ADD CONSTRAINT "ReminderSkip_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
