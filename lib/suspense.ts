import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type LinkedPurchase = { id: string; voucher_no: string; status: string; total_amount: string; vendor_name_raw: string | null };

/**
 * A suspense voucher and the purchase vouchers settling it. `settled` counts approved purchases;
 * `inProgress` counts drafts and those awaiting review. Rejected/void purchases don't count.
 */
export async function suspenseSummary(supabase: Supabase, id: string) {
  const [{ data: sv }, { data: linked }] = await Promise.all([
    supabase.from("vouchers").select("id, voucher_no, type, status, total_amount, created_by").eq("id", id).maybeSingle(),
    supabase.from("vouchers").select("id, voucher_no, status, total_amount, vendor_name_raw")
      .eq("suspense_id", id).order("created_at").overrideTypes<LinkedPurchase[], { merge: false }>(),
  ]);
  if (!sv || sv.type !== "suspense_voucher") return null;
  const rows = linked ?? [];
  const total = (st: string[]) => rows.filter((r) => st.includes(r.status)).reduce((a, r) => a + Number(r.total_amount), 0);
  return {
    id: sv.id as string,
    voucherNo: sv.voucher_no as string,
    status: sv.status as string,
    createdBy: sv.created_by as string,
    amount: Number(sv.total_amount),
    settled: total(["approved"]),
    inProgress: total(["draft", "submitted", "queried"]),
    linked: rows,
  };
}
