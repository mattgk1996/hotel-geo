/** Staff sessions last 12 hours from the moment the PIN was entered (spec §2). */
export const MAX_SESSION_MS = 12 * 60 * 60 * 1000;

type Claims = { iat?: number; amr?: unknown };

/**
 * When the user actually authenticated, in ms. Supabase keeps the original sign-in time in the
 * `amr` claim across token refreshes, whereas `iat` moves forward on every refresh.
 */
export function authenticatedAtMs(claims: Claims): number | null {
  if (Array.isArray(claims.amr)) {
    const times = claims.amr
      .map((e) => (e && typeof e === "object" ? (e as { timestamp?: unknown }).timestamp : undefined))
      .filter((t): t is number => typeof t === "number");
    if (times.length) return Math.max(...times) * 1000;
  }
  return typeof claims.iat === "number" ? claims.iat * 1000 : null;
}

export function isSessionTooOld(claims: Claims, nowMs: number = Date.now()): boolean {
  const at = authenticatedAtMs(claims);
  return at === null || nowMs - at > MAX_SESSION_MS;
}
