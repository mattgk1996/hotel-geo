import Link from "next/link";
import type { CurrentStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { suspenseSummary } from "@/lib/suspense";
import { cardClass } from "@/lib/ui";
import { StatusChip } from "@/components/voucher-list";

/** Settlement of a suspense voucher: its purchase vouchers, what's left, and "Add purchase voucher". */
export async function SuspensePanel({ voucherId, staff }: { voucherId: string; staff: CurrentStaff }) {
  const supabase = await createSupabaseServerClient();
  const s = await suspenseSummary(supabase, voucherId);
  if (!s) return null;
  const left = s.amount - s.settled - s.inProgress;
  const canAdd = ["submitted", "approved"].includes(s.status) && (s.createdBy === staff.id || staff.role === "admin");
  const href = (id: string) => (staff.role === "admin" ? `/review/${id}` : `/vouchers/${id}`);

  return (
    <section className={cardClass}>
      <h2 className="font-semibold">Settlement</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {formatINR(s.amount)} given · {formatINR(s.settled)} settled (approved)
        {s.inProgress > 0 && <> · {formatINR(s.inProgress)} awaiting approval</>} ·{" "}
        <span className={`font-semibold ${left < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
          {left === 0 ? "fully accounted" : left > 0 ? `${formatINR(left)} left` : `${formatINR(-left)} over`}
        </span>
      </p>
      {s.linked.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {s.linked.map((p) => (
            <li key={p.id}>
              <Link href={href(p.id)} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2">{p.voucher_no} · {p.vendor_name_raw ?? "—"} <StatusChip status={p.status} /></span>
                <span className="tabular-nums">{formatINR(p.total_amount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canAdd ? (
        <Link href={`/vouchers/new?suspense=${s.id}`} className="mt-3 inline-block rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white">
          + Add purchase voucher
        </Link>
      ) : s.status === "draft" ? (
        <p className="mt-2 text-xs text-zinc-500">Submit this suspense voucher first; then add purchase vouchers as bills come in.</p>
      ) : null}
    </section>
  );
}

/** "Settles suspense voucher X" link for a purchase voucher. */
export async function SettlesLink({ suspenseId, admin }: { suspenseId: string; admin: boolean }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("vouchers").select("voucher_no").eq("id", suspenseId).maybeSingle();
  if (!data) return null;
  return (
    <p className="text-sm">
      Settles suspense voucher{" "}
      <Link href={admin ? `/review/${suspenseId}` : `/vouchers/${suspenseId}`} className="font-medium text-emerald-700 underline">{data.voucher_no}</Link>
    </p>
  );
}
