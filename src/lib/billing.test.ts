import { describe, it, expect } from "vitest";
import { splitGst, GST_RATE } from "./billing";

describe("splitGst", () => {
  it("splits a GST-inclusive total into equal CGST/SGST halves", () => {
    const { amountWithoutGst, cgstAmount, sgstAmount } = splitGst(4800);
    expect(cgstAmount).toBeCloseTo(sgstAmount, 10);
    expect(amountWithoutGst + cgstAmount + sgstAmount).toBeCloseTo(4800, 10);
  });

  it("computes the pre-tax amount using the current GST rate", () => {
    const total = 11800;
    const { amountWithoutGst } = splitGst(total);
    expect(amountWithoutGst).toBeCloseTo(total / (1 + GST_RATE), 10);
  });

  it("returns zero breakdown for a zero total", () => {
    const result = splitGst(0);
    expect(result).toEqual({ amountWithoutGst: 0, cgstAmount: 0, sgstAmount: 0 });
  });
});
