-- CreateEnum
CREATE TYPE "ClassChangeKind" AS ENUM ('SKIP', 'MOVE');

-- CreateEnum
CREATE TYPE "ClassChangeStatus" AS ENUM ('BOOKED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "maxStudents" INTEGER;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "canMoveDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxStudents" INTEGER;

-- CreateTable
CREATE TABLE "ClassChange" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "fromBatchId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toBatchId" TEXT,
    "toDate" TIMESTAMP(3),
    "kind" "ClassChangeKind" NOT NULL,
    "status" "ClassChangeStatus" NOT NULL DEFAULT 'BOOKED',
    "source" TEXT NOT NULL DEFAULT 'front-desk',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassChange_studentId_idx" ON "ClassChange"("studentId");

-- CreateIndex
CREATE INDEX "ClassChange_fromBatchId_fromDate_idx" ON "ClassChange"("fromBatchId", "fromDate");

-- CreateIndex
CREATE INDEX "ClassChange_toBatchId_toDate_idx" ON "ClassChange"("toBatchId", "toDate");

-- AddForeignKey
ALTER TABLE "ClassChange" ADD CONSTRAINT "ClassChange_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassChange" ADD CONSTRAINT "ClassChange_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassChange" ADD CONSTRAINT "ClassChange_fromBatchId_fkey" FOREIGN KEY ("fromBatchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassChange" ADD CONSTRAINT "ClassChange_toBatchId_fkey" FOREIGN KEY ("toBatchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Limits and move rules set by the academy (1 Nov 2026). Matched by name; a
-- course that isn't listed stays unlimited and can only move within its day.
UPDATE "Course" SET "maxStudents" = 8 WHERE "name" = 'Keyboard';
UPDATE "Course" SET "maxStudents" = 6 WHERE "name" = 'Guitar';
UPDATE "Course" SET "maxStudents" = 5 WHERE "name" IN ('Carnatic Vocals', 'Hindustani Vocals', 'Western Vocals');
UPDATE "Course" SET "maxStudents" = 4 WHERE "name" IN ('Drums', 'Violin');
UPDATE "Course" SET "canMoveDay" = true WHERE "name" IN ('Drums', 'Keyboard', 'Guitar');
