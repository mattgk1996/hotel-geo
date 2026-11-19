import { describe, expect, it } from "vitest";
import { authenticatedAtMs, isSessionTooOld, MAX_SESSION_MS } from "@/lib/auth/session-age";

const now = Date.UTC(2026, 10, 19, 12, 0, 0);
const sec = (ms: number) => Math.floor(ms / 1000);

describe("12-hour session limit", () => {
  it("uses the password sign-in time from amr, not the refreshed iat", () => {
    const signedIn = now - 13 * 3600_000;
    const claims = { iat: sec(now - 60_000), amr: [{ method: "password", timestamp: sec(signedIn) }] };
    expect(authenticatedAtMs(claims)).toBe(sec(signedIn) * 1000);
    expect(isSessionTooOld(claims, now)).toBe(true);
  });

  it("keeps sessions younger than 12 hours", () => {
    const claims = { amr: [{ method: "password", timestamp: sec(now - MAX_SESSION_MS + 60_000) }] };
    expect(isSessionTooOld(claims, now)).toBe(false);
  });

  it("falls back to iat and treats missing times as expired", () => {
    expect(isSessionTooOld({ iat: sec(now - 3600_000) }, now)).toBe(false);
    expect(isSessionTooOld({}, now)).toBe(true);
    expect(isSessionTooOld({ amr: ["password"] }, now)).toBe(true);
  });
});
