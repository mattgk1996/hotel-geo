import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { istToday } from "@/lib/vouchers";
import { VOUCHER_ROW_COLUMNS, VoucherList, type VoucherRow } from "@/components/voucher-list";

export default async function HomePage() {
  const staff = await requireStaff();
  const supabase = await createSupabaseServerClient();

  const [today, queried] = await Promise.all([
    supabase.from("vouchers").select(VOUCHER_ROW_COLUMNS).eq("created_by", staff.id).eq("voucher_date", istToday())
      .order("created_at", { ascending: false }).overrideTypes<VoucherRow[], { merge: false }>(),
    supabase.from("vouchers").select(VOUCHER_ROW_COLUMNS).eq("created_by", staff.id).eq("status", "queried")
      .order("updated_at", { ascending: true }).overrideTypes<VoucherRow[], { merge: false }>(),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Hello, {staff.fullName.split(" ")[0]}</h1>

      <Link
        href="/vouchers/new"
        className="flex h-20 items-center justify-center rounded-2xl bg-emerald-700 text-xl font-semibold text-white shadow-sm active:bg-emerald-800"
      >
        + New voucher
      </Link>

      <VoucherList title="Needs your reply" rows={queried.data ?? []} empty="Nothing waiting for you." showNote />
      <VoucherList title="My vouchers today" rows={today.data ?? []} empty="No vouchers yet today." />
    </>
  );
}
