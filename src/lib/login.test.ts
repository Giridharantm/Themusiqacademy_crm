import { describe, it, expect } from "vitest";
import { isPlaceholderEmail, parseLoginId, phoneMatchTail, placeholderEmail } from "./login";

describe("parseLoginId", () => {
  it("reads an email address as an email", () => {
    expect(parseLoginId("  admin@musiqacademy.test ")).toEqual({ kind: "email", email: "admin@musiqacademy.test" });
  });

  it("reads a phone number however it is typed", () => {
    expect(parseLoginId("98457 08094")).toEqual({ kind: "phone", phone: "9845708094" });
    expect(parseLoginId("+91 98457-08094")).toEqual({ kind: "phone", phone: "9845708094" });
    expect(parseLoginId("098457 08094")).toEqual({ kind: "phone", phone: "9845708094" });
  });

  it("gives nothing for blank or unusable input", () => {
    expect(parseLoginId("")).toBeNull();
    expect(parseLoginId("   ")).toBeNull();
    expect(parseLoginId(null)).toBeNull();
    expect(parseLoginId("12345")).toBeNull();
    expect(parseLoginId("hello")).toBeNull();
  });
});

describe("placeholder emails", () => {
  it("is made from the number and recognised again", () => {
    const e = placeholderEmail("98457 08094");
    expect(e).toBe("9845708094@learner.musiqacademy.invalid");
    expect(isPlaceholderEmail(e)).toBe(true);
    expect(isPlaceholderEmail("asha@example.com")).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
  });
});

describe("phoneMatchTail", () => {
  it("is the last 10 digits for an Indian number and every digit for a foreign one", () => {
    expect(phoneMatchTail("9845708094")).toBe("9845708094");
    expect(phoneMatchTail("+14155550123")).toBe("14155550123");
  });
});
