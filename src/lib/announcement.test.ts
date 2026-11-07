import { describe, it, expect } from "vitest";
import { familiesFromRows, nextClassDate, parseScope, type AnnounceSource } from "@/lib/announcement";

// 7 Nov 2026 is a Saturday.
const TODAY = "2026-11-07";

const row = (o: Partial<AnnounceSource> & Pick<AnnounceSource, "studentId" | "studentName">): AnnounceSource => ({
  batchId: `b-${o.studentId}`,
  courseName: "Keyboard",
  dayOfWeek: "SAT",
  startTime: "17:00",
  phones: [{ phone: "9000000001", consented: true }],
  ...o,
});

describe("nextClassDate", () => {
  it("is today when the class meets today", () => expect(nextClassDate("SAT", TODAY)).toBe("2026-11-07"));
  it("is the next day it falls on", () => {
    expect(nextClassDate("SUN", TODAY)).toBe("2026-11-08");
    expect(nextClassDate("TUE", TODAY)).toBe("2026-11-10"); // Monday is skipped: the academy is closed
    expect(nextClassDate("FRI", TODAY)).toBe("2026-11-13");
  });
  it("wraps into next month and year", () => {
    expect(nextClassDate("WED", "2026-12-30")).toBe("2026-12-30");
    expect(nextClassDate("TUE", "2026-12-30")).toBe("2027-01-05");
  });
});

describe("familiesFromRows", () => {
  it("sends once to a number shared by siblings, written about the one with the soonest class", () => {
    const a = familiesFromRows(
      [
        row({ studentId: "s1", studentName: "Zoya", dayOfWeek: "TUE" }),
        row({ studentId: "s2", studentName: "Aarav", dayOfWeek: "SUN" }),
      ],
      TODAY
    );
    expect(a.families).toHaveLength(1);
    expect(a.families[0]).toMatchObject({ studentName: "Aarav", classDate: "2026-11-08", students: ["Aarav", "Zoya"] });
  });

  it("sends once to a student with two classes, using the soonest", () => {
    const a = familiesFromRows(
      [
        row({ studentId: "s1", studentName: "Ria", batchId: "tue", dayOfWeek: "TUE", courseName: "Guitar" }),
        row({ studentId: "s1", studentName: "Ria", batchId: "sat", dayOfWeek: "SAT", courseName: "Keyboard" }),
      ],
      TODAY
    );
    expect(a.families).toHaveLength(1);
    expect(a.families[0]).toMatchObject({ courseName: "Keyboard", batchId: "sat", classDate: "2026-11-07" });
  });

  it("breaks a tie on the date by the earlier start time, then the name", () => {
    const a = familiesFromRows(
      [
        row({ studentId: "s1", studentName: "Bela", startTime: "18:00" }),
        row({ studentId: "s2", studentName: "Cara", startTime: "14:00" }),
        row({ studentId: "s3", studentName: "Anu", startTime: "14:00" }),
      ],
      TODAY
    );
    expect(a.families[0].studentName).toBe("Anu");
  });

  it("keeps different numbers separate and skips numbers that have not agreed", () => {
    const a = familiesFromRows(
      [
        row({ studentId: "s1", studentName: "A", phones: [{ phone: "9000000001", consented: true }] }),
        row({ studentId: "s2", studentName: "B", phones: [{ phone: "9000000002", consented: false }] }),
        row({ studentId: "s3", studentName: "C", phones: [{ phone: "9000000003", consented: true }, { phone: "9000000004", consented: true }] }),
      ],
      TODAY
    );
    expect(a.families.map((f) => f.phone).sort()).toEqual(["9000000001", "9000000003", "9000000004"]);
    expect(a.notAgreed).toEqual(["9000000002"]);
  });

  it("does not report a number as not-agreed when it is reached through another student", () => {
    const a = familiesFromRows(
      [
        row({ studentId: "s1", studentName: "A", phones: [{ phone: "9000000001", consented: false }] }),
        row({ studentId: "s2", studentName: "B", phones: [{ phone: "9000000001", consented: true }] }),
      ],
      TODAY
    );
    expect(a.families).toHaveLength(1);
    expect(a.notAgreed).toEqual([]);
  });

  it("counts students with no number at all", () => {
    const a = familiesFromRows([row({ studentId: "s1", studentName: "A", phones: [] }), row({ studentId: "s1", studentName: "A", batchId: "x", phones: [] })], TODAY);
    expect(a.families).toEqual([]);
    expect(a.noNumber).toBe(1);
  });
});

describe("parseScope", () => {
  it("is everyone by default", () => expect(parseScope({})).toEqual({ kind: "all" }));
  it("takes one or several instruments or classes", () => {
    expect(parseScope({ audience: "courses", courseId: "c1" })).toEqual({ kind: "courses", courseIds: ["c1"] });
    expect(parseScope({ audience: "batches", batchId: ["b1", "b2"] })).toEqual({ kind: "batches", batchIds: ["b1", "b2"] });
  });
  it("never widens an empty choice to everyone", () => {
    expect(parseScope({ audience: "courses" })).toEqual({ kind: "courses", courseIds: [] });
    expect(parseScope({ audience: "batches", batchId: [""] })).toEqual({ kind: "batches", batchIds: [] });
  });
});
