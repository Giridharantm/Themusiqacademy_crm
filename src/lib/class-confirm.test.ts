import { describe, it, expect } from "vitest";
import { replyCounts, replyStatus } from "./class-confirm";
import { parseReplyId, replyId } from "./class-reply";

describe("replyStatus", () => {
  it("says confirmed or can't come from the latest tap", () => {
    expect(replyStatus({ sent: true, answer: "YES", change: null })).toBe("CONFIRMED");
    expect(replyStatus({ sent: true, answer: "NO", change: null })).toBe("DECLINED");
  });

  it("lets a booked skip or move win over the bare tap", () => {
    expect(replyStatus({ sent: true, answer: "NO", change: "SKIP" })).toBe("CANCELLED");
    expect(replyStatus({ sent: true, answer: "NO", change: "MOVE" })).toBe("MOVED");
    expect(replyStatus({ sent: true, answer: null, change: "SKIP" })).toBe("CANCELLED"); // staff booked it
  });

  it("waits for a reply once sent, and says nothing before", () => {
    expect(replyStatus({ sent: true, answer: null, change: null })).toBe("NO_REPLY");
    expect(replyStatus({ sent: false, answer: null, change: null })).toBeNull();
  });
});

describe("replyCounts", () => {
  it("tallies each state and ignores nulls", () => {
    expect(replyCounts(["CONFIRMED", "CONFIRMED", "DECLINED", "NO_REPLY", null])).toEqual({ CONFIRMED: 2, DECLINED: 1, CANCELLED: 0, MOVED: 0, NO_REPLY: 1 });
  });
});

describe("comp class reply ids", () => {
  it("round-trips the comp yes and no taps", () => {
    for (const kind of ["cyes", "cno"] as const) {
      const r = { kind, studentId: "s1", batchId: "b1", date: "2026-11-03" };
      expect(parseReplyId(replyId(r))).toEqual(r);
    }
  });
});
