"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client using the same cookie session as the server (subject to RLS). Realtime only. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
