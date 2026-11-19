import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";

type VoucherRow = {
  id: string;
  voucher_no: string;
  type: string;
  status: string;
  total_amount: string;
  vendor_name_raw: string | null;
  accounts_note: string | null;
};

function istToday(): string {
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata" }).format(new Date());
}

export default async function HomePage() {
  const staff = await requireStaff();
  const supabase = await createSupabaseServerClient();
  const cols = "id, voucher_no, type, status, total_amount, vendor_name_raw, accounts_note";

  const [today, queried] = await Promise.all([
    supabase.from("vouchers").select(cols).eq("created_by", staff.id).eq("voucher_date", istToday())
      .order("created_at", { ascending: false }).overrideTypes<VoucherRow[], { merge: false }>(),
    supabase.from("vouchers").select(cols).eq("created_by", staff.id).eq("status", "queried")
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

function VoucherList({ title, rows, empty, showNote }: { title: string; rows: VoucherRow[]; empty: string; showNote?: boolean }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map((v) => (
            <li key={v.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">{v.vendor_name_raw || v.type.replaceAll("_", " ")}</p>
                <p className="text-xs text-zinc-500">{v.voucher_no} · {v.status}</p>
                {showNote && v.accounts_note && <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{v.accounts_note}</p>}
              </div>
              <p className="shrink-0 font-medium tabular-nums">{formatINR(v.total_amount)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
