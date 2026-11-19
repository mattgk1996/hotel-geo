import Link from "next/link";
import { formatINR } from "@/lib/money";
import { STATUS_LABELS, VOUCHER_TYPE_LABELS, type VoucherType } from "@/lib/vouchers";

export type VoucherRow = {
  id: string;
  voucher_no: string;
  type: string;
  status: string;
  total_amount: string;
  vendor_name_raw: string | null;
  accounts_note: string | null;
  voucher_date?: string;
};

export const VOUCHER_ROW_COLUMNS = "id, voucher_no, type, status, total_amount, vendor_name_raw, accounts_note, voucher_date";

const CHIP: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  submitted: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  queried: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  void: "bg-zinc-200 text-zinc-500 line-through dark:bg-zinc-800",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[status] ?? CHIP.draft}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function VoucherList({ title, rows, empty, showNote }: { title?: string; rows: VoucherRow[]; empty: string; showNote?: boolean }) {
  return (
    <section>
      {title && <h2 className="mb-2 text-lg font-semibold">{title}</h2>}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map((v) => (
            <li key={v.id}>
              <Link href={`/vouchers/${v.id}`} className="flex items-start justify-between gap-3 p-3 active:bg-zinc-50 dark:active:bg-zinc-900">
                <div className="min-w-0">
                  <p className="truncate font-medium">{v.vendor_name_raw || VOUCHER_TYPE_LABELS[v.type as VoucherType] || v.type}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                    <span>{v.voucher_no}</span>
                    {v.voucher_date && <span>{v.voucher_date}</span>}
                    <StatusChip status={v.status} />
                  </p>
                  {showNote && v.accounts_note && <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{v.accounts_note}</p>}
                </div>
                <p className="shrink-0 font-medium tabular-nums">{formatINR(v.total_amount)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
