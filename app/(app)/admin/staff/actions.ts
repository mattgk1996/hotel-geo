"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { derivePassword, isValidPin, isValidUsername, isWeakPin, normalizeUsername, staffEmail } from "@/lib/auth/pin";
import { isRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getPinPepper,
  missingServerConfig,
} from "@/lib/supabase/server";

export type FormState = { ok: boolean; message?: string };

function pinProblem(pin: string): string | null {
  if (!isValidPin(pin)) return "PIN must be exactly 6 digits.";
  if (isWeakPin(pin)) return "That PIN is too easy to guess. Avoid 111111 or 123456.";
  return null;
}

function configProblem(): FormState | null {
  const missing = missingServerConfig();
  return missing.length ? { ok: false, message: `Missing settings in Vercel: ${missing.join(", ")}` } : null;
}

export async function createStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const cfg = configProblem();
  if (cfg) return cfg;

  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const departmentId = String(formData.get("department_id") ?? "") || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const pin = String(formData.get("pin") ?? "");

  if (!isValidUsername(username)) {
    return { ok: false, message: "Username: 2–32 lowercase letters, numbers, dot, dash or underscore." };
  }
  if (!fullName) return { ok: false, message: "Full name is required." };
  if (!isRole(role)) return { ok: false, message: "Pick a role." };
  const bad = pinProblem(pin);
  if (bad) return { ok: false, message: bad };

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: existing } = await supabase.from("staff").select("id").eq("username", username).maybeSingle();
  if (existing) return { ok: false, message: `Username "${username}" is already taken.` };

  // Create the auth user with a throwaway password, then set the PIN-derived one (needs the user id).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: staffEmail(username),
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { username },
  });
  if (createErr || !created.user) {
    return { ok: false, message: `Could not create login: ${createErr?.message ?? "unknown error"}` };
  }
  const authUserId = created.user.id;

  try {
    const { error: pwErr } = await admin.auth.admin.updateUserById(authUserId, {
      password: derivePassword(authUserId, pin, getPinPepper()),
    });
    if (pwErr) throw pwErr;

    const { error: insErr } = await supabase.from("staff").insert({
      username,
      full_name: fullName,
      role,
      department_id: departmentId,
      phone,
      auth_user_id: authUserId,
      pin_derived: true,
    });
    if (insErr) throw insErr;
  } catch (err) {
    await admin.auth.admin.deleteUser(authUserId); // don't leave an orphan login behind
    const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
    return { ok: false, message: `Could not add staff: ${message}` };
  }

  refresh();
  return { ok: true, message: `Added ${fullName}. They log in as "${username}" with the PIN you set.` };
}

export async function resetPin(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const cfg = configProblem();
  if (cfg) return cfg;

  const staffId = String(formData.get("staff_id") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const bad = pinProblem(pin);
  if (bad) return { ok: false, message: bad };

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from("staff").select("id, full_name, auth_user_id").eq("id", staffId).maybeSingle();
  if (!target) return { ok: false, message: "Staff member not found." };
  if (!target.auth_user_id) return { ok: false, message: "This staff member has no login linked." };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, {
    password: derivePassword(target.auth_user_id, pin, getPinPepper()),
  });
  if (error) return { ok: false, message: `Could not reset PIN: ${error.message}` };

  await supabase.from("staff").update({ pin_derived: true }).eq("id", staffId);
  await admin.rpc("reset_failed_pins", { p_staff_id: staffId }); // also unlocks a locked account

  refresh();
  return { ok: true, message: `New PIN set for ${target.full_name}. Any lock has been cleared.` };
}

export async function setStaffActive(formData: FormData): Promise<void> {
  const me = await requireRole("admin");
  const staffId = String(formData.get("staff_id") ?? "");
  const active = formData.get("active") === "true";
  if (staffId === me.id) return; // never lock yourself out

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase.from("staff").select("auth_user_id").eq("id", staffId).maybeSingle();
  if (!target) return;

  await supabase.from("staff").update({ active }).eq("id", staffId);
  if (target.auth_user_id && !configProblem()) {
    // Ban/unban the login too, so a deactivated person's existing session can't be refreshed.
    await createSupabaseAdminClient().auth.admin.updateUserById(target.auth_user_id, {
      ban_duration: active ? "none" : "876000h",
    });
  }
  refresh();
}
