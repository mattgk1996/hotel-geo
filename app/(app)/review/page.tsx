import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { fieldClass, secondaryButton } from "@/lib/ui";
import { STATUS_LABELS, VOUCHER_TYPES, VOUCHER_TYPE_LABELS, type VoucherType } from "@/lib/vouchers";
import { StatusChip } from "@/components/voucher-list";

const FLAGS = ["amount_mismatch", "duplicate_suspect", "low_confidence", "old_date"] as const;
const FLAG_LABELS: Record<string, string> = {
  amount_mismatch: "Amount mismatch", duplicate_suspect: "Possible duplicate", low_confidence: "Low confidence", old_date: "Old date",
};
const QUEUE_STATUSES = ["submitted", "queried", "approved", "rejected", "void"] as const;

type Row = {
  id: string; voucher_no: string; type: VoucherType; status: string; total_amount: string; created_at: string;
  vendor_name_raw: string | null; flags: string[];
  departments: { name: string } | null; creator: { full_name: string } | null; expense_heads: { code: string } | null;
};

function age(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export default async function ReviewQueuePage(props: PageProps<"/review">) {
  await requireRole("admin");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const status = (QUEUE_STATUSES as readonly string[]).includes(one("status")) ? one("status") : "submitted";
  const flag = (FLAGS as readonly string[]).includes(one("flag")) ? one("flag") : "";
  const type = (VOUCHER_TYPES as readonly string[]).includes(one("type")) ? one("type") : "";
  const dept = /^[0-9a-f-]{36}$/i.test(one("dept")) ? one("dept") : "";

  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("vouchers")
    .select("id, voucher_no, type, status, total_amount, created_at, vendor_name_raw, flags, departments(name), creator:staff!vouchers_created_by_fkey(full_name), expense_heads(code)")
    .eq("status", status)
    .order("created_at", { ascending: status === "submitted" || status === "queried" })
    .limit(200);
  if (flag) q = q.contains("flags", [flag]);
  if (type) q = q.eq("type", type);
  if (dept) q = q.eq("department_id", dept);

  const [{ data: rows }, { data: depts }] = await Promise.all([
    q.overrideTypes<Row[], { merge: false }>(),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Review</h1>

      <form className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select name="status" defaultValue={status} className={fieldClass}>
          {QUEUE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select name="flag" defaultValue={flag} className={fieldClass}>
          <option value="">Any flag</option>
          {FLAGS.map((f) => <option key={f} value={f}>{FLAG_LABELS[f]}</option>)}
        </select>
        <select name="type" defaultValue={type} className={fieldClass}>
          <option value="">Any type</option>
          {VOUCHER_TYPES.map((t) => <option key={t} value={t}>{VOUCHER_TYPE_LABELS[t]}</option>)}
        </select>
        <select name="dept" defaultValue={dept} className={fieldClass}>
          <option value="">Any department</option>
          {(depts ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className={secondaryButton}>Filter</button>
      </form>

      {!rows?.length ? (
        <p className="text-sm text-zinc-500">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map((v) => {
            const misc = v.expense_heads?.code === "MISC" && Number(v.total_amount) > 2000;
            return (
              <li key={v.id}>
                <Link href={`/review/${v.id}`} className="flex items-start justify-between gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{v.vendor_name_raw || VOUCHER_TYPE_LABELS[v.type]}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                      <span>{v.voucher_no}</span>
                      <span>{v.departments?.name}</span>
                      <span>{v.creator?.full_name}</span>
                      <span>{age(v.created_at)}</span>
                      {status !== "submitted" && <StatusChip status={v.status} />}
                      {v.flags.map((f) => (
                        <span key={f} className="rounded-full bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-950 dark:text-red-200">{FLAG_LABELS[f] ?? f}</span>
                      ))}
                      {misc && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">Misc &gt; ₹2,000</span>}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium tabular-nums">{formatINR(v.total_amount)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
