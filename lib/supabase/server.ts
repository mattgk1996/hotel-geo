import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

/**
 * Anonymous client with no session (health check, PIN verification during "change PIN").
 * Returns null when the env vars are missing so pages can explain what to set.
 */
export function createAnonServerClient() {
  const cfg = publicConfig();
  if (!cfg) return null;
  return createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client acting as the logged-in staff member (cookie session). Subject to RLS. */
export async function createSupabaseServerClient() {
  // First: mark the caller as request-time only. The Supabase client reads the clock and the
  // session as soon as it is created, which must never happen during (runtime) prerendering.
  await connection();
  const cookieStore = await cookies();
  const cfg = publicConfig();
  if (!cfg) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set");
  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes them.
        }
      },
    },
  });
}

/**
 * Service-role client: bypasses RLS. Only for auth user management and PIN lockout counters.
 * Never pass its results to the client without filtering.
 */
export function createSupabaseAdminClient() {
  const cfg = publicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cfg || !serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(cfg.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getPinPepper(): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error("PIN_PEPPER is not set (needs a random string of at least 32 characters)");
  }
  return pepper;
}

/** Which server-only settings are missing, for friendly error messages. */
export function missingServerConfig(): string[] {
  return [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PIN_PEPPER",
  ].filter((k) => !process.env[k] || (k === "PIN_PEPPER" && process.env[k]!.length < 32));
}
