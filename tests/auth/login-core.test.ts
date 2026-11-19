import { beforeEach, describe, expect, it } from "vitest";
import { attemptPinLogin, WRONG_CREDENTIALS, type LoginDeps, type StaffLoginRecord } from "@/lib/auth/login-core";
import { derivePassword } from "@/lib/auth/pin";

const pepper = "p".repeat(40);
const PIN = "482913";

/** In-memory stand-in for Supabase Auth + the staff table + lockout functions. */
function fakeWorld(opts: { pinDerived?: boolean; active?: boolean } = {}) {
  let now = new Date("2026-11-19T10:00:00Z");
  const staff: StaffLoginRecord = {
    id: "staff-1",
    username: "ravi",
    authUserId: "auth-1",
    active: opts.active ?? true,
    lockedUntil: null,
    pinDerived: opts.pinDerived ?? true,
  };
  let attempts = 0;
  let password = staff.pinDerived ? derivePassword("auth-1", PIN, pepper) : PIN;
  const verifyCalls: string[] = [];

  const deps: LoginDeps = {
    pepper,
    now: () => now,
    findStaff: async (u) => (u === staff.username ? { ...staff } : null),
    verify: async (email, pw) => {
      verifyCalls.push(pw);
      return email === "ravi@staff.hotelgeo.app" && pw === password;
    },
    upgradePassword: async (_s, derived) => {
      password = derived;
      staff.pinDerived = true;
    },
    registerFailure: async () => {
      attempts += 1;
      if (attempts >= 5) {
        attempts = 0;
        staff.lockedUntil = new Date(now.getTime() + 15 * 60_000);
      }
      return { attempts, lockedUntil: staff.lockedUntil };
    },
    resetFailures: async () => {
      attempts = 0;
      staff.lockedUntil = null;
    },
  };
  return {
    deps,
    staff,
    verifyCalls,
    get password() {
      return password;
    },
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe("PIN login", () => {
  let w: ReturnType<typeof fakeWorld>;
  beforeEach(() => {
    w = fakeWorld();
  });

  it("logs in with the right PIN, never sending the raw PIN to Supabase", async () => {
    const r = await attemptPinLogin(w.deps, " Ravi ", PIN);
    expect(r.ok).toBe(true);
    expect(w.verifyCalls).toEqual([derivePassword("auth-1", PIN, pepper)]);
  });

  it("gives the same message for unknown users and wrong PINs", async () => {
    expect(await attemptPinLogin(w.deps, "nobody", PIN)).toEqual({ ok: false, error: WRONG_CREDENTIALS });
    expect(await attemptPinLogin(w.deps, "ravi", "111222")).toEqual({ ok: false, error: WRONG_CREDENTIALS });
  });

  it("warns when 2 tries are left, then locks for 15 minutes on the 5th wrong PIN", async () => {
    for (let i = 0; i < 2; i++) await attemptPinLogin(w.deps, "ravi", "000001");
    expect((await attemptPinLogin(w.deps, "ravi", "000001")).ok).toBe(false);
    const fourth = await attemptPinLogin(w.deps, "ravi", "000001");
    expect(fourth).toMatchObject({ error: expect.stringContaining("1 try left") });
    const fifth = await attemptPinLogin(w.deps, "ravi", "000001");
    expect(fifth).toMatchObject({ error: expect.stringContaining("Try again in 15 minutes") });
  });

  it("rejects even the correct PIN while locked, without asking Supabase", async () => {
    for (let i = 0; i < 5; i++) await attemptPinLogin(w.deps, "ravi", "000001");
    const callsBefore = w.verifyCalls.length;
    w.advance(10 * 60_000);
    expect(await attemptPinLogin(w.deps, "ravi", PIN)).toMatchObject({
      ok: false,
      error: expect.stringContaining("5 minutes"),
    });
    expect(w.verifyCalls.length).toBe(callsBefore);

    w.advance(5 * 60_000 + 1000);
    expect((await attemptPinLogin(w.deps, "ravi", PIN)).ok).toBe(true);
  });

  it("resets the counter after a successful login", async () => {
    for (let i = 0; i < 4; i++) await attemptPinLogin(w.deps, "ravi", "000001");
    expect((await attemptPinLogin(w.deps, "ravi", PIN)).ok).toBe(true);
    const next = await attemptPinLogin(w.deps, "ravi", "000001");
    expect(next).toEqual({ ok: false, error: WRONG_CREDENTIALS }); // back to 1 failure, no warning
  });

  it("refuses inactive staff", async () => {
    const inactive = fakeWorld({ active: false });
    expect(await attemptPinLogin(inactive.deps, "ravi", PIN)).toEqual({ ok: false, error: WRONG_CREDENTIALS });
  });

  it("upgrades a dashboard-created raw-PIN account to a derived password on first login", async () => {
    const legacy = fakeWorld({ pinDerived: false });
    expect(legacy.password).toBe(PIN);
    expect((await attemptPinLogin(legacy.deps, "ravi", PIN)).ok).toBe(true);
    expect(legacy.password).toBe(derivePassword("auth-1", PIN, pepper));
    expect(legacy.staff.pinDerived).toBe(true);

    // From now on only the derived password is tried.
    legacy.verifyCalls.length = 0;
    expect((await attemptPinLogin(legacy.deps, "ravi", PIN)).ok).toBe(true);
    expect(legacy.verifyCalls).toEqual([derivePassword("auth-1", PIN, pepper)]);
  });

  it("does not fall back to the raw PIN for upgraded accounts", async () => {
    await attemptPinLogin(w.deps, "ravi", "000001");
    expect(w.verifyCalls).toEqual([derivePassword("auth-1", "000001", pepper)]);
  });
});
