import { connection } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/server";

export type AppHealth =
  | {
      status: "connected";
      departments: number;
      expenseHeads: number;
      admins: number;
      adminsLinked: number;
      dbTime: string;
    }
  | { status: "not_configured"; missing: string[] }
  | { status: "error"; message: string };

/** Calls the public.app_health() SQL function to prove the app can reach the database. */
export async function getAppHealth(): Promise<AppHealth> {
  await connection(); // always run at request time, never at build time

  const supabase = createAnonServerClient();
  if (!supabase) {
    const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(
      (k) => !process.env[k],
    );
    return { status: "not_configured", missing };
  }

  const { data, error } = await supabase.rpc("app_health");
  if (error) return { status: "error", message: error.message };

  const h = data as Record<string, unknown>;
  return {
    status: "connected",
    departments: Number(h.departments),
    expenseHeads: Number(h.expense_heads),
    admins: Number(h.admins),
    adminsLinked: Number(h.admins_linked),
    dbTime: String(h.db_time),
  };
}
