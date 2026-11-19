import { createHmac } from "node:crypto";

export const PIN_PATTERN = /^\d{6}$/;
export const USERNAME_PATTERN = /^[a-z0-9._-]{2,32}$/; // same rule as the staff.username check
export const STAFF_EMAIL_DOMAIN = "staff.hotelgeo.app";

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/** Rejects PINs that are trivially guessable: one repeated digit or a straight run (123456, 987654). */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const d = pin.split("").map(Number);
  const steps = d.slice(1).map((n, i) => n - d[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

/** Synthetic Supabase Auth email for a staff member (spec §2). */
export function staffEmail(username: string): string {
  return `${username}@${STAFF_EMAIL_DOMAIN}`;
}

/**
 * The Supabase password is never the PIN itself. It's an HMAC of the PIN with a server-only
 * secret (PIN_PEPPER), so a 6-digit PIN can't be brute-forced directly against Supabase Auth
 * with the public key; every attempt must go through our login code, which enforces the lockout.
 */
export function derivePassword(authUserId: string, pin: string, pepper: string): string {
  if (!pepper || pepper.length < 32) {
    throw new Error("PIN_PEPPER must be set to a random string of at least 32 characters");
  }
  const mac = createHmac("sha256", pepper).update(`${authUserId}:${pin}`).digest("base64url");
  return `hg1.${mac}`;
}
