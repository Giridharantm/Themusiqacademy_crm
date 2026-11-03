-- CreateEnum
CREATE TYPE "ConfirmKind" AS ENUM ('REGULAR', 'COMP');

-- CreateEnum
CREATE TYPE "ConfirmAnswer" AS ENUM ('YES', 'NO');

-- CreateTable
CREATE TABLE "ClassConfirmation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" "ConfirmKind" NOT NULL,
    "answer" "ConfirmAnswer" NOT NULL,
    "phone" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassConfirmation_date_idx" ON "ClassConfirmation"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ClassConfirmation_studentId_batchId_date_kind_key" ON "ClassConfirmation"("studentId", "batchId", "date", "kind");

-- AddForeignKey
ALTER TABLE "ClassConfirmation" ADD CONSTRAINT "ClassConfirmation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
