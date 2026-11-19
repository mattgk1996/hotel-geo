import { derivePassword, isValidPin, isValidUsername, normalizeUsername, staffEmail } from "./pin";

export type StaffLoginRecord = {
  id: string;
  username: string;
  authUserId: string | null;
  active: boolean;
  lockedUntil: Date | null;
  pinDerived: boolean;
};

export type PinCheckDeps = {
  pepper: string;
  now: () => Date;
  /** Tries the email/password against Supabase Auth. Returns true on success. */
  verify: (email: string, password: string) => Promise<boolean>;
  /** Replaces a legacy raw-PIN password with the derived one and marks pin_derived. */
  upgradePassword: (staff: StaffLoginRecord, derivedPassword: string) => Promise<void>;
  registerFailure: (staffId: string) => Promise<{ attempts: number; lockedUntil: Date | null }>;
  resetFailures: (staffId: string) => Promise<void>;
};

export type LoginDeps = PinCheckDeps & {
  findStaff: (username: string) => Promise<StaffLoginRecord | null>;
};

export type PinResult = { ok: true; staff: StaffLoginRecord } | { ok: false; error: string };

export const WRONG_CREDENTIALS = "Wrong username or PIN.";

function lockedMessage(until: Date, now: Date): string {
  const mins = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60000));
  return `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}

/** Checks a PIN for a known staff member, applying the 5-tries / 15-minute lockout (spec §2). */
export async function checkPin(deps: PinCheckDeps, staff: StaffLoginRecord, pin: string): Promise<PinResult> {
  const now = deps.now();
  if (!staff.active || !staff.authUserId) return { ok: false, error: WRONG_CREDENTIALS };
  if (staff.lockedUntil && staff.lockedUntil > now) {
    return { ok: false, error: lockedMessage(staff.lockedUntil, now) };
  }
  if (!isValidPin(pin)) return { ok: false, error: "PIN must be 6 digits." };

  const email = staffEmail(staff.username);
  const derived = derivePassword(staff.authUserId, pin, deps.pepper);

  let ok = await deps.verify(email, derived);
  if (!ok && !staff.pinDerived) {
    // Account created by hand in the Supabase dashboard with the raw PIN as password.
    ok = await deps.verify(email, pin);
    if (ok) await deps.upgradePassword(staff, derived);
  }

  if (ok) {
    await deps.resetFailures(staff.id);
    return { ok: true, staff };
  }

  const { attempts, lockedUntil } = await deps.registerFailure(staff.id);
  if (lockedUntil && lockedUntil > now) return { ok: false, error: lockedMessage(lockedUntil, now) };
  const left = 5 - attempts;
  return {
    ok: false,
    error: left <= 2 ? `${WRONG_CREDENTIALS} ${left} ${left === 1 ? "try" : "tries"} left before a 15-minute lock.` : WRONG_CREDENTIALS,
  };
}

export async function attemptPinLogin(deps: LoginDeps, rawUsername: string, pin: string): Promise<PinResult> {
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username) || !isValidPin(pin)) return { ok: false, error: WRONG_CREDENTIALS };
  const staff = await deps.findStaff(username);
  if (!staff) return { ok: false, error: WRONG_CREDENTIALS };
  return checkPin(deps, staff, pin);
}
