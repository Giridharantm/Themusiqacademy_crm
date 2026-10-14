import { describe, it, expect } from "vitest";
import { normalizeIndianPhone, parseTrialRequest, looksLikeBot, createRateLimiter, leadNotes, MIN_FILL_MS } from "./trial-request";

const COURSES = ["Keyboard", "Guitar", "Drums", "Violin", "Carnatic Vocals"];

describe("normalizeIndianPhone", () => {
  it.each([
    ["9884904856", "9884904856"],
    ["98849 04856", "9884904856"],
    ["+91 98849-04856", "9884904856"],
    ["919884904856", "9884904856"],
    ["09884904856", "9884904856"],
    ["0919884904856", "9884904856"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "1234567890", "98849048", "98849048567", "abcdefghij", "5884904856"])("rejects %s", (input) => {
    expect(normalizeIndianPhone(input)).toBeNull();
  });
});

describe("parseTrialRequest", () => {
  const good = { name: "  Asha   Rao ", phone: "98849 04856", email: "asha@example.com", interest: "guitar", classFor: "My child (under 18)" };

  it("cleans up and accepts a complete request", () => {
    const r = parseTrialRequest(good, COURSES);
    expect(r).toEqual({
      ok: true,
      value: { name: "Asha Rao", phone: "9884904856", email: "asha@example.com", interest: "Guitar", classFor: "My child (under 18)" },
    });
  });

  it("treats email as optional and an unknown 'class for' value as unset", () => {
    const r = parseTrialRequest({ ...good, email: "", classFor: "hacked" }, COURSES);
    expect(r.ok && r.value.email).toBeNull();
    expect(r.ok && r.value.classFor).toBeNull();
  });

  it.each([
    [{ ...good, name: "A" }, /name/i],
    [{ ...good, phone: "12345" }, /mobile/i],
    [{ ...good, email: "not-an-email" }, /email/i],
    [{ ...good, interest: "Banjo" }, /instrument/i],
    [{ ...good, interest: "" }, /instrument/i],
  ])("rejects invalid input %#", (body, message) => {
    const r = parseTrialRequest(body, COURSES);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(message);
  });

  it("rejects non-objects", () => {
    expect(parseTrialRequest(null, COURSES).ok).toBe(false);
    expect(parseTrialRequest("hi", COURSES).ok).toBe(false);
  });

  it("caps field lengths instead of storing huge input", () => {
    const r = parseTrialRequest({ ...good, name: "x".repeat(500) }, COURSES);
    expect(r.ok && r.value.name.length).toBe(80);
  });
});

describe("looksLikeBot", () => {
  it("flags a filled honeypot, a missing fill time and a too-fast submit", () => {
    expect(looksLikeBot({ website: "http://spam.example", elapsedMs: 60000 })).toBe(true);
    expect(looksLikeBot({ elapsedMs: 60000, website: "  " })).toBe(false);
    expect(looksLikeBot({})).toBe(true);
    expect(looksLikeBot({ elapsedMs: 300 })).toBe(true);
    expect(looksLikeBot({ elapsedMs: MIN_FILL_MS - 1 })).toBe(true);
    expect(looksLikeBot(null)).toBe(true);
  });

  it("lets a quick autofill-and-tap submit through, but not an instant one", () => {
    expect(looksLikeBot({ elapsedMs: 1500 })).toBe(false);
    expect(looksLikeBot({ elapsedMs: 800 })).toBe(true);
  });

  it("lets a normal human-speed submit through", () => {
    expect(looksLikeBot({ elapsedMs: MIN_FILL_MS })).toBe(false);
    expect(looksLikeBot({ elapsedMs: 45000, website: "" })).toBe(false);
  });
});

describe("createRateLimiter", () => {
  it("limits each key and recovers once the window has passed", () => {
    const rl = createRateLimiter({ perKey: 2, global: 100, windowMs: 1000 });
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 100)).toBe(true);
    expect(rl.allow("a", 200)).toBe(false);
    expect(rl.allow("b", 200)).toBe(true);
    expect(rl.allow("a", 1101)).toBe(true);
  });

  it("enforces the global cap across different keys", () => {
    const rl = createRateLimiter({ perKey: 5, global: 3, windowMs: 1000 });
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("b", 0)).toBe(true);
    expect(rl.allow("c", 0)).toBe(true);
    expect(rl.allow("d", 0)).toBe(false);
  });
});

describe("leadNotes", () => {
  it("records where the lead came from and who the class is for", () => {
    const notes = leadNotes(
      { name: "A", phone: "9884904856", email: null, interest: "Guitar", classFor: "Myself (adult)" },
      new Date("2026-10-14T08:05:30Z")
    );
    expect(notes).toContain("website form");
    expect(notes).toContain("Class is for: Myself (adult).");
    expect(notes).toContain("2026-10-14 08:05 UTC");
  });
});
