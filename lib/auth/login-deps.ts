import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, getPinPepper } from "@/lib/supabase/server";
import type { LoginDeps, PinCheckDeps, StaffLoginRecord } from "./login-core";

type Verify = (email: string, password: string) => Promise<boolean>;

/** Wires the pure PIN logic to Supabase. `verify` decides which client receives the session. */
export function pinCheckDeps(verify: Verify): PinCheckDeps & { admin: SupabaseClient } {
  const admin = createSupabaseAdminClient();
  return {
    admin,
    pepper: getPinPepper(),
    now: () => new Date(),
    verify,
    async upgradePassword(staff, derivedPassword) {
      if (!staff.authUserId) return;
      const { error } = await admin.auth.admin.updateUserById(staff.authUserId, { password: derivedPassword });
      if (error) throw new Error(`Could not upgrade password: ${error.message}`);
      await admin.from("staff").update({ pin_derived: true }).eq("id", staff.id);
    },
    async registerFailure(staffId) {
      const { data, error } = await admin.rpc("register_failed_pin", { p_staff_id: staffId });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as { attempts: number; locked_until: string | null };
      return { attempts: row.attempts, lockedUntil: row.locked_until ? new Date(row.locked_until) : null };
    },
    async resetFailures(staffId) {
      await admin.rpc("reset_failed_pins", { p_staff_id: staffId });
    },
  };
}

export async function findStaffForLogin(admin: SupabaseClient, by: { username?: string; id?: string }) {
  let q = admin.from("staff").select("id, username, auth_user_id, active, locked_until, pin_derived");
  q = by.id ? q.eq("id", by.id) : q.eq("username", by.username ?? "");
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    authUserId: data.auth_user_id,
    active: data.active,
    lockedUntil: data.locked_until ? new Date(data.locked_until) : null,
    pinDerived: data.pin_derived,
  } satisfies StaffLoginRecord;
}

export function loginDeps(verify: Verify): LoginDeps {
  const deps = pinCheckDeps(verify);
  return { ...deps, findStaff: (username) => findStaffForLogin(deps.admin, { username }) };
}
