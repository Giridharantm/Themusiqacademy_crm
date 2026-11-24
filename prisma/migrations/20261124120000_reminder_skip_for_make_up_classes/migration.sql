-- A reminder skip is now for either the student's regular class that day (false, every existing row)
-- or a make-up class they are coming to that day (true), so each can be skipped on its own.
-- AlterTable
ALTER TABLE "ReminderSkip" ADD COLUMN     "makeUp" BOOLEAN NOT NULL DEFAULT false;

-- DropIndex
DROP INDEX "ReminderSkip_studentId_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "ReminderSkip_studentId_date_makeUp_key" ON "ReminderSkip"("studentId", "date", "makeUp");
