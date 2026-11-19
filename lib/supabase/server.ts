import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Anonymous (publishable-key) Supabase client for server components and route handlers.
 * Milestone 2 replaces this with a cookie-based session client for logged-in staff.
 * Returns null when the env vars are missing so pages can explain what to set.
 */
export function createAnonServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
