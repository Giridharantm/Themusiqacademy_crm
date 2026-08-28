-- Course: drop feeAmount/feeCycle. Invoicing now uses a fixed plan-based
-- price list (PLAN_INVOICE_AMOUNTS) across every instrument instead of a
-- per-course fee, so these columns were only ever displayed on the Courses
-- page and never read anywhere else.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Course" ("id", "name", "description", "durationMinutes", "createdAt")
SELECT "id", "name", "description", "durationMinutes", "createdAt" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
