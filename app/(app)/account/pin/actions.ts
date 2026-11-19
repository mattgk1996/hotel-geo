"use server";

import { checkPin } from "@/lib/auth/login-core";
import { findStaffForLogin, pinCheckDeps } from "@/lib/auth/login-deps";
import { derivePassword, isValidPin, isWeakPin } from "@/lib/auth/pin";
import { requireStaff } from "@/lib/auth/session";
import { createAnonServerClient, getPinPepper } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message?: string };

export async function changeOwnPin(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireStaff();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!isValidPin(next)) return { ok: false, message: "New PIN must be exactly 6 digits." };
  if (next !== confirm) return { ok: false, message: "The two new PINs don't match." };
  if (next === current) return { ok: false, message: "New PIN must be different from the current one." };
  if (isWeakPin(next)) return { ok: false, message: "That PIN is too easy to guess. Avoid 111111 or 123456." };

  try {
    // Verify the current PIN on a throwaway client so the browser's session cookie is untouched.
    const probe = createAnonServerClient()!;
    const deps = pinCheckDeps(async (email, password) => {
      const { error } = await probe.auth.signInWithPassword({ email, password });
      if (!error) await probe.auth.signOut({ scope: "local" });
      return !error;
    });
    const record = await findStaffForLogin(deps.admin, { id: me.id });
    if (!record?.authUserId) return { ok: false, message: "Your account isn't linked to a login." };

    const check = await checkPin(deps, record, current);
    if (!check.ok) return { ok: false, message: check.error.replace("username or PIN", "current PIN") };

    const password = derivePassword(record.authUserId, next, getPinPepper());
    const { error } = await deps.admin.auth.admin.updateUserById(record.authUserId, { password });
    if (error) throw error;
    await deps.admin.from("staff").update({ pin_derived: true }).eq("id", record.id);
    return { ok: true, message: "PIN changed. Use the new PIN next time you log in." };
  } catch (err) {
    console.error("changeOwnPin failed", err);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
