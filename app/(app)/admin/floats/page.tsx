import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { cardClass, fieldClass, labelClass } from "@/lib/ui";
import { istToday } from "@/lib/vouchers";
import { ActionForm } from "@/components/action-form";
import { addTopup, saveFloat } from "../actions";

type Float = {
  id: string; name: string; department_id: string; opening_amount: string; current_balance: string;
  low_balance_threshold: string; custodian_staff_id: string | null; active: boolean;
  departments: { name: string } | null; custodian: { full_name: string } | null;
};
type Opt = { id: string; name: string };

function FloatFields({ f, depts, staff }: { f?: Float; depts: Opt[]; staff: Opt[] }) {
  return (
    <>
      {f && <input type="hidden" name="id" value={f.id} />}
      <label className="flex flex-col gap-1"><span className={labelClass}>Name</span><input name="name" required defaultValue={f?.name} placeholder="Store petty cash" className={fieldClass} /></label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Department</span>
        <select name="department_id" defaultValue={f?.department_id} className={fieldClass}>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Custodian</span>
        <select name="custodian_staff_id" defaultValue={f?.custodian_staff_id ?? ""} className={fieldClass}>
          <option value="">—</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {!f && <label className="flex flex-col gap-1"><span className={labelClass}>Opening amount (₹)</span><input name="opening_amount" inputMode="decimal" className={fieldClass} /></label>}
      <label className="flex flex-col gap-1"><span className={labelClass}>Low-balance alert below (₹)</span><input name="low_balance_threshold" inputMode="decimal" defaultValue={f ? String(Number(f.low_balance_threshold)) : ""} className={fieldClass} /></label>
      {f && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={f.active} /> Active</label>}
    </>
  );
}

export default async function FloatsPage() {
  await requireRole("admin");
  const supabase = await createSupabaseServerClient();
  const [{ data: floats }, { data: depts }, { data: staff }, { data: topups }] = await Promise.all([
    supabase.from("cash_floats")
      .select("id, name, department_id, opening_amount, current_balance, low_balance_threshold, custodian_staff_id, active, departments(name), custodian:staff!cash_floats_custodian_staff_id_fkey(full_name)")
      .order("active", { ascending: false }).order("name").overrideTypes<Float[], { merge: false }>(),
    supabase.from("departments").select("id, name").eq("active", true).order("name"),
    supabase.from("staff").select("id, full_name").eq("active", true).order("full_name"),
    supabase.from("float_topups").select("id, amount, date, note, cash_floats(name)").order("created_at", { ascending: false }).limit(15)
      .overrideTypes<{ id: string; amount: string; date: string; note: string | null; cash_floats: { name: string } | null }[], { merge: false }>(),
  ]);
  const deptOpts = depts ?? [];
  const staffOpts = (staff ?? []).map((s) => ({ id: s.id, name: s.full_name }));
  const active = (floats ?? []).filter((f) => f.active);

  return (
    <>
      <div><Link href="/admin" className="text-sm text-zinc-500">← Masters</Link><h1 className="text-2xl font-semibold">Cash floats</h1></div>

      <ul className="flex flex-col gap-2">
        {(floats ?? []).map((f) => {
          const low = Number(f.current_balance) < Number(f.low_balance_threshold);
          return (
            <li key={f.id} className={`${cardClass} ${f.active ? "" : "opacity-60"}`}>
              <details>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{f.name}</p>
                    <p className="text-xs text-zinc-500">{f.departments?.name}{f.custodian ? ` · ${f.custodian.full_name}` : ""}{f.active ? "" : " · inactive"}</p>
                  </div>
                  <p className={`font-semibold tabular-nums ${low || Number(f.current_balance) < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                    {formatINR(f.current_balance)}{low && <span className="block text-right text-xs font-normal">low</span>}
                  </p>
                </summary>
                <ActionForm action={saveFloat} submitLabel="Save" className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FloatFields f={f} depts={deptOpts} staff={staffOpts} />
                </ActionForm>
              </details>
            </li>
          );
        })}
      </ul>

      {active.length > 0 && (
        <section className={cardClass}>
          <h2 className="font-semibold">Record a top-up</h2>
          <ActionForm action={addTopup} submitLabel="Add top-up" resetOnSuccess className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Float</span>
              <select name="float_id" className={fieldClass}>{active.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1"><span className={labelClass}>Amount (₹)</span><input name="amount" inputMode="decimal" required className={fieldClass} /></label>
            <label className="flex flex-col gap-1"><span className={labelClass}>Date</span><input name="date" type="date" defaultValue={istToday()} className={fieldClass} /></label>
            <label className="flex flex-col gap-1"><span className={labelClass}>Note</span><input name="note" className={fieldClass} /></label>
          </ActionForm>
          {topups && topups.length > 0 && (
            <ul className="mt-4 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {topups.map((t) => (
                <li key={t.id} className="flex justify-between gap-3 py-1.5">
                  <span>{t.date} · {t.cash_floats?.name}{t.note ? ` · ${t.note}` : ""}</span>
                  <span className="tabular-nums">{formatINR(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={cardClass}>
        <h2 className="font-semibold">New float</h2>
        <ActionForm action={saveFloat} submitLabel="Create float" resetOnSuccess className="mt-2 grid gap-3 sm:grid-cols-2">
          <FloatFields depts={deptOpts} staff={staffOpts} />
        </ActionForm>
      </section>
    </>
  );
}
