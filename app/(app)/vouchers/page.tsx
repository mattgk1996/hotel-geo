import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VOUCHER_ROW_COLUMNS, VoucherList, type VoucherRow } from "@/components/voucher-list";

export default async function MyVouchersPage() {
  const staff = await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vouchers")
    .select(VOUCHER_ROW_COLUMNS)
    .eq("created_by", staff.id)
    .order("created_at", { ascending: false })
    .limit(100)
    .overrideTypes<VoucherRow[], { merge: false }>();

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My vouchers</h1>
        <Link href="/vouchers/new" className="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white">+ New</Link>
      </div>
      <VoucherList rows={data ?? []} empty="You haven't created any vouchers yet." showNote />
    </>
  );
}
