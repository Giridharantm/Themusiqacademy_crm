/*
  Warnings:

  - Added the required column `studentCode` to the `Student` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dob" DATETIME,
    "gender" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "joinDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "leadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Student_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Student" ("address", "createdAt", "dob", "email", "gender", "id", "joinDate", "leadId", "name", "phone", "status") SELECT "address", "createdAt", "dob", "email", "gender", "id", "joinDate", "leadId", "name", "phone", "status" FROM "Student";
DROP TABLE "Student";
ALTER TABLE "new_Student" RENAME TO "Student";
CREATE UNIQUE INDEX "Student_studentCode_key" ON "Student"("studentCode");
CREATE UNIQUE INDEX "Student_leadId_key" ON "Student"("leadId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
