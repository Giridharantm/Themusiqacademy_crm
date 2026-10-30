import { describe, it, expect } from "vitest";
import { defaultLoginPassword } from "./login-password";

describe("defaultLoginPassword", () => {
  it("is the phone number as digits, however it was typed", () => {
    expect(defaultLoginPassword("98457 08094")).toBe("9845708094");
    expect(defaultLoginPassword("+91 98457-08094")).toBe("9845708094");
    expect(defaultLoginPassword("098457 08094")).toBe("9845708094");
  });

  it("keeps the country code of a foreign number, without the plus", () => {
    expect(defaultLoginPassword("+1 (415) 555-0123")).toBe("14155550123");
  });

  it("is null when there is no usable number", () => {
    expect(defaultLoginPassword("")).toBeNull();
    expect(defaultLoginPassword(null)).toBeNull();
    expect(defaultLoginPassword("12345")).toBeNull();
  });
});
