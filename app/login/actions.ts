"use server";

import { redirect } from "next/navigation";
import { attemptPinLogin } from "@/lib/auth/login-core";
import { loginDeps } from "@/lib/auth/login-deps";
import { createSupabaseServerClient, missingServerConfig } from "@/lib/supabase/server";

export type LoginState = { ok: boolean; error?: string; username?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const pin = String(formData.get("pin") ?? "");

  const missing = missingServerConfig();
  if (missing.length) {
    return { ok: false, error: `The app isn't fully set up yet (missing: ${missing.join(", ")}).` };
  }

  const supabase = await createSupabaseServerClient();
  try {
    const result = await attemptPinLogin(
      loginDeps(async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return !error;
      }),
      username,
      pin,
    );
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, username: result.staff.username };
  } catch (err) {
    console.error("login failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
