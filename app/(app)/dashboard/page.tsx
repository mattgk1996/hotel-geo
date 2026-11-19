import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import {
  RANGES, SPEND_TYPES, addDays, daysBetween, hoursSince, resolveRange, sameDaysLastMonth, sum, totalsBy, type RangeKey,
} from "@/lib/dashboard";
import { PAYMENT_MODE_LABELS, istToday, type PaymentMode } from "@/lib/vouchers";
import { cardClass, fieldClass } from "@/lib/ui";
import { BarList, TrendChart } from "@/components/charts";
import { LiveRefresh } from "@/components/live-refresh";
import { VOUCHER_ROW_COLUMNS, VoucherList, type VoucherRow } from "@/components/voucher-list";

type Spend = {
  voucher_date: string; total_amount: string; payment_mode: PaymentMode | null; vendor_name_raw: string | null;
  vendors: { name: string } | null; expense_heads: { name: string } | null; departments: { name: string } | null;
};
type Coll = { date: string; cash: string; card: string; upi: string; other: string; departments: { name: string } | null };
type Flagged = { id: string; voucher_no: string; total_amount: string; flags: string[]; vendor_name_raw: string | null; status: string };

const RANGE_LABELS: Record<RangeKey, string> = { today: "Today", yesterday: "Yesterday", week: "This week", month: "This month", custom: "Custom" };
const n = (x: string | number | null | undefined) => Number(x ?? 0);
const collTotal = (c: Coll) => n(c.cash) + n(c.card) + n(c.upi) + n(c.other);

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  await requireRole("admin");
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = istToday();
  const range = resolveRange(today, str("range"), str("from"), str("to"));
  const lastMonth = sameDaysLastMonth(today);
  const trendFrom = addDays(today, -29);
  const fetchFrom = [range.from, lastMonth.from, trendFrom].sort()[0];
  const fetchTo = range.to > today ? range.to : today;

  const supabase = await createSupabaseServerClient();
  const { data: misc } = await supabase.from("expense_heads").select("id").eq("code", "MISC").maybeSingle();

  const [spendQ, collQ, pendingQ, floatsQ, flaggedQ, miscQ, recentQ] = await Promise.all([
    supabase.from("vouchers")
      .select("voucher_date, total_amount, payment_mode, vendor_name_raw, vendors(name), expense_heads(name), departments(name)")
      .eq("status", "approved").in("type", SPEND_TYPES).gte("voucher_date", fetchFrom).lte("voucher_date", fetchTo)
      .limit(20000).overrideTypes<Spend[], { merge: false }>(),
    supabase.from("collections").select("date, cash, card, upi, other, departments(name)")
      .gte("date", fetchFrom).lte("date", fetchTo).limit(5000).overrideTypes<Coll[], { merge: false }>(),
    supabase.from("vouchers").select("created_at, total_amount, voucher_date, type").eq("status", "submitted")
      .order("created_at", { ascending: true }).limit(5000),
    supabase.from("cash_floats").select("id, name, current_balance, low_balance_threshold").eq("active", true).order("name"),
    supabase.from("vouchers").select("id, voucher_no, total_amount, flags, vendor_name_raw, status")
      .overlaps("flags", ["duplicate_suspect", "amount_mismatch"]).in("status", ["submitted", "approved", "queried"])
      .order("created_at", { ascending: false }).limit(20).overrideTypes<Flagged[], { merge: false }>(),
    misc
      ? supabase.from("vouchers").select("id, voucher_no, total_amount, flags, vendor_name_raw, status")
          .eq("head_id", misc.id).gt("total_amount", 2000).in("status", ["submitted", "approved", "queried"])
          .order("created_at", { ascending: false }).limit(20).overrideTypes<Flagged[], { merge: false }>()
      : Promise.resolve({ data: [] as Flagged[] }),
    supabase.from("vouchers").select(VOUCHER_ROW_COLUMNS).neq("status", "draft")
      .order("created_at", { ascending: false }).limit(20).overrideTypes<VoucherRow[], { merge: false }>(),
  ]);

  const spendAll = spendQ.data ?? [];
  const collAll = collQ.data ?? [];
  const inRange = <T,>(rows: T[], d: (r: T) => string, from: string, to: string) => rows.filter((r) => d(r) >= from && d(r) <= to);

  const spendRange = inRange(spendAll, (r) => r.voucher_date, range.from, range.to);
  const collRange = inRange(collAll, (r) => r.date, range.from, range.to);
  const spendToday = sum(inRange(spendAll, (r) => r.voucher_date, today, today), (r) => n(r.total_amount));
  const mtd = sum(inRange(spendAll, (r) => r.voucher_date, `${today.slice(0, 8)}01`, today), (r) => n(r.total_amount));
  const lastMtd = sum(inRange(spendAll, (r) => r.voucher_date, lastMonth.from, lastMonth.to), (r) => n(r.total_amount));
  const collToday = inRange(collAll, (r) => r.date, today, today);
  const pending = pendingQ.data ?? [];
  const pendingInRange = pending.filter((p) => p.voucher_date >= range.from && p.voucher_date <= range.to && (SPEND_TYPES as readonly string[]).includes(p.type));
  const oldestHours = pending.length ? hoursSince(pending[0].created_at) : 0;

  const trendDays = daysBetween(trendFrom, today);
  const spendByDay = new Map(totalsBy(inRange(spendAll, (r) => r.voucher_date, trendFrom, today), (r) => r.voucher_date, (r) => n(r.total_amount)).map((t) => [t.label, t.value]));
  const collByDay = new Map(totalsBy(inRange(collAll, (r) => r.date, trendFrom, today), (r) => r.date, collTotal).map((t) => [t.label, t.value]));

  const flagged = [...(flaggedQ.data ?? []), ...(miscQ.data ?? [])].filter((v, i, a) => a.findIndex((w) => w.id === v.id) === i);
  const vsLast = lastMtd ? Math.round(((mtd - lastMtd) / lastMtd) * 100) : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <LiveRefresh tables={["vouchers", "collections", "cash_floats"]} />
      </div>

      {/* Range filter */}
      <form className="flex flex-wrap items-center gap-2">
        {RANGES.filter((r) => r !== "custom").map((r) => (
          <Link key={r} href={`/dashboard?range=${r}`} className={`rounded-full px-3 py-1.5 text-sm ${range.key === r ? "bg-emerald-700 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
            {RANGE_LABELS[r]}
          </Link>
        ))}
        <input type="hidden" name="range" value="custom" />
        <input type="date" name="from" defaultValue={range.from} className={`${fieldClass} w-auto py-1.5`} aria-label="From" />
        <input type="date" name="to" defaultValue={range.to} className={`${fieldClass} w-auto py-1.5`} aria-label="To" />
        <button className={`rounded-full px-3 py-1.5 text-sm ${range.key === "custom" ? "bg-emerald-700 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>Custom</button>
      </form>

      {/* Top tiles */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Spend today" value={formatINR(spendToday)} />
        <Tile label="Spend this month" value={formatINR(mtd)}
          sub={vsLast === null ? "No spend same days last month" : `${vsLast >= 0 ? "▲" : "▼"} ${Math.abs(vsLast)}% vs same days last month`} />
        <Tile label="Collections today" value={formatINR(sum(collToday, collTotal))}
          sub={`Cash ${formatINR(sum(collToday, (c) => n(c.cash)))} · Card ${formatINR(sum(collToday, (c) => n(c.card)))} · UPI ${formatINR(sum(collToday, (c) => n(c.upi)))}`} />
        <Link href="/review" className="contents">
          <Tile label="Pending review" value={String(pending.length)}
            sub={pending.length ? `Oldest ${oldestHours < 24 ? `${oldestHours}h` : `${Math.floor(oldestHours / 24)}d`} · ${formatINR(sum(pending, (p) => n(p.total_amount)))}` : "All clear"} />
        </Link>
      </section>

      <p className="-mt-3 text-sm text-zinc-500">
        {range.label}: spend {formatINR(sum(spendRange, (r) => n(r.total_amount)))} approved
        {pendingInRange.length > 0 && <> · {formatINR(sum(pendingInRange, (p) => n(p.total_amount)))} pending</>}
        {" "}· collections {formatINR(sum(collRange, collTotal))}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Spend by head · ${range.label}`}>
          <BarList items={totalsBy(spendRange, (r) => r.expense_heads?.name ?? "No head", (r) => n(r.total_amount))} />
        </Card>
        <Card title={`Spend by department · ${range.label}`}>
          <BarList items={totalsBy(spendRange, (r) => r.departments?.name ?? "—", (r) => n(r.total_amount))} />
        </Card>
        <Card title={`Payment mode · ${range.label}`}>
          <BarList items={totalsBy(spendRange, (r) => (r.payment_mode ? PAYMENT_MODE_LABELS[r.payment_mode] : "Not set"), (r) => n(r.total_amount))} />
        </Card>
        <Card title={`Top 10 vendors · ${range.label}`}>
          <BarList max={10} items={totalsBy(spendRange, (r) => r.vendors?.name ?? r.vendor_name_raw ?? "Unknown", (r) => n(r.total_amount)).slice(0, 10)} />
        </Card>
      </div>

      <Card title="Last 30 days · spend vs collections">
        <TrendChart days={trendDays} spend={trendDays.map((d) => spendByDay.get(d) ?? 0)} collections={trendDays.map((d) => collByDay.get(d) ?? 0)} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cash floats">
          {!floatsQ.data?.length ? <p className="text-sm text-zinc-500">No floats set up.</p> : (
            <ul className="flex flex-col gap-2 text-sm">
              {floatsQ.data.map((f) => {
                const low = n(f.current_balance) < n(f.low_balance_threshold) || n(f.current_balance) < 0;
                return (
                  <li key={f.id} className="flex justify-between gap-3">
                    <span>{f.name}</span>
                    <span className={`tabular-nums ${low ? "font-semibold text-red-700 dark:text-red-400" : ""}`}>
                      {low && "⚠ Low · "}{formatINR(f.current_balance)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Flags">
          {!flagged.length ? <p className="text-sm text-zinc-500">✓ No duplicates, mismatches or large Misc entries.</p> : (
            <ul className="flex flex-col gap-2 text-sm">
              {flagged.map((v) => (
                <li key={v.id}>
                  <Link href={`/review/${v.id}`} className="flex justify-between gap-3 hover:underline">
                    <span className="truncate">
                      ⚠ {v.voucher_no} · {v.vendor_name_raw ?? "—"} ·{" "}
                      {[...v.flags.filter((x) => x === "duplicate_suspect" || x === "amount_mismatch").map((x) => x === "duplicate_suspect" ? "possible duplicate" : "amount mismatch"),
                        ...(v.flags.length === 0 || !v.flags.some((x) => x === "duplicate_suspect" || x === "amount_mismatch") ? ["Misc > ₹2,000"] : [])].join(", ")}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatINR(v.total_amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <VoucherList title="Recent vouchers" rows={recentQ.data ?? []} empty="No vouchers yet." />
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={cardClass}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={cardClass}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
