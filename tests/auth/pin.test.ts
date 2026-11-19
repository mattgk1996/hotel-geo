import { describe, expect, it } from "vitest";
import { derivePassword, isValidPin, isValidUsername, isWeakPin, normalizeUsername, staffEmail } from "@/lib/auth/pin";

const pepper = "x".repeat(32);

describe("PIN helpers", () => {
  it("accepts exactly six digits", () => {
    expect(isValidPin("482913")).toBe(true);
    for (const bad of ["12345", "1234567", "12a456", " 482913", ""]) expect(isValidPin(bad)).toBe(false);
  });

  it("flags repeated and sequential PINs as weak", () => {
    for (const weak of ["000000", "777777", "123456", "456789", "987654", "654321"]) expect(isWeakPin(weak)).toBe(true);
    for (const ok of ["482913", "112233", "135790"]) expect(isWeakPin(ok)).toBe(false);
  });

  it("normalises and validates usernames", () => {
    expect(normalizeUsername("  Ravi.K ")).toBe("ravi.k");
    expect(isValidUsername("ravi.k")).toBe(true);
    expect(isValidUsername("a")).toBe(false);
    expect(isValidUsername("ravi k")).toBe(false);
    expect(staffEmail("ravi.k")).toBe("ravi.k@staff.hotelgeo.app");
  });

  it("derives a stable password that depends on user, PIN and pepper", () => {
    const a = derivePassword("user-1", "482913", pepper);
    expect(a).toBe(derivePassword("user-1", "482913", pepper));
    expect(a).toMatch(/^hg1\.[A-Za-z0-9_-]{43}$/);
    expect(a.length).toBeLessThanOrEqual(72); // bcrypt limit in Supabase Auth
    expect(derivePassword("user-2", "482913", pepper)).not.toBe(a);
    expect(derivePassword("user-1", "482914", pepper)).not.toBe(a);
    expect(derivePassword("user-1", "482913", "y".repeat(32))).not.toBe(a);
    expect(a).not.toContain("482913");
  });

  it("refuses a missing or short pepper", () => {
    expect(() => derivePassword("u", "482913", "")).toThrow(/PIN_PEPPER/);
    expect(() => derivePassword("u", "482913", "short")).toThrow(/PIN_PEPPER/);
  });
});
