import { describe, it, expect } from "vitest";
import { parseStudentDetails } from "@/lib/student-details";

const ok = (raw: Parameters<typeof parseStudentDetails>[0]) => {
  const r = parseStudentDetails(raw);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("parseStudentDetails", () => {
  it("needs a name", () => {
    expect(parseStudentDetails({ name: "   " })).toEqual({ ok: false, error: "Name is required" });
  });

  it("trims and keeps what is filled in; blank optional fields become null", () => {
    expect(ok({ name: "  Aarav Gupta ", phone: "", email: " ", address: "", dob: "", gender: "" })).toEqual({
      name: "Aarav Gupta",
      dob: null,
      gender: null,
      phone: null,
      email: null,
      address: null,
    });
  });

  it("stores an Indian number as 10 digits however it was typed", () => {
    expect(ok({ name: "A", phone: "98450 12345" }).phone).toBe("9845012345");
    expect(ok({ name: "A", phone: "+91 98450-12345" }).phone).toBe("9845012345");
  });

  it("keeps a foreign number with its +", () => {
    expect(ok({ name: "A", phone: "+44 7911 123456" }).phone).toBe("+447911123456");
  });

  it("rejects a number that is not valid", () => {
    expect(parseStudentDetails({ name: "A", phone: "12345" })).toMatchObject({ ok: false });
    expect(parseStudentDetails({ name: "A", phone: "abc" })).toMatchObject({ ok: false });
  });

  it("checks the email shape", () => {
    expect(ok({ name: "A", email: "a@b.co" }).email).toBe("a@b.co");
    expect(parseStudentDetails({ name: "A", email: "not-an-email" })).toMatchObject({ ok: false });
  });

  it("accepts a real date of birth and rejects an impossible one", () => {
    expect(ok({ name: "A", dob: "2015-03-09" }).dob?.toISOString().slice(0, 10)).toBe("2015-03-09");
    expect(parseStudentDetails({ name: "A", dob: "2015-02-30" })).toMatchObject({ ok: false });
    expect(parseStudentDetails({ name: "A", dob: "09/03/2015" })).toMatchObject({ ok: false });
  });

  it("only allows the genders on the form", () => {
    expect(ok({ name: "A", gender: "Female" }).gender).toBe("Female");
    expect(parseStudentDetails({ name: "A", gender: "x" })).toMatchObject({ ok: false });
  });
});
