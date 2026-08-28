-- Attendance: batchId -> courseId. Marking only ever needs "did this student
-- attend this instrument on this date" — not which specific batch/time-slot
-- — so attendance is now keyed by (studentId, courseId, date) instead of
-- (studentId, batchId, date). Existing rows are backfilled from their old
-- batch's course; if that ever collides two old rows onto the same
-- (student, course, date) the PRESENT/LATE row wins over ABSENT.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "markedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attendance_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Attendance_studentId_courseId_date_key" ON "new_Attendance"("studentId", "courseId", "date");
INSERT OR IGNORE INTO "new_Attendance" ("id", "studentId", "courseId", "date", "status", "note", "markedById", "createdAt")
SELECT a."id", a."studentId", b."courseId", a."date", a."status", a."note", a."markedById", a."createdAt"
FROM "Attendance" a
JOIN "Batch" b ON a."batchId" = b."id"
ORDER BY CASE a."status" WHEN 'PRESENT' THEN 0 WHEN 'LATE' THEN 1 ELSE 2 END;
DROP TABLE "Attendance";
ALTER TABLE "new_Attendance" RENAME TO "Attendance";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
