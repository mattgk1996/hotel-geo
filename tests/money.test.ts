import { describe, expect, it } from "vitest";
import { formatINR } from "@/lib/money";

describe("formatINR", () => {
  it("uses Indian digit grouping with two decimals", () => {
    expect(formatINR(123456)).toBe("₹1,23,456.00");
    expect(formatINR(12345678.5)).toBe("₹1,23,45,678.50");
    expect(formatINR("450")).toBe("₹450.00");
  });

  it("shows a dash for missing values", () => {
    expect(formatINR(null)).toBe("—");
    expect(formatINR(undefined)).toBe("—");
    expect(formatINR("abc")).toBe("—");
  });
});
