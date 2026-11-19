import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { cardClass, fieldClass, labelClass } from "@/lib/ui";
import { isIsoDate, istToday } from "@/lib/vouchers";
import { ActionForm } from "@/components/action-form";
import { saveCollection } from "./actions";

type Row = { id: string; date: string; cash: string; card: string; upi: string; other: string; note: string | null; department_id: string; departments: { name: string } | null };

export default async function CollectionsPage(props: PageProps<"/collections">) {
  await requireRole("accounts", "admin");
  const sp = await props.searchParams;
  const date = typeof sp.date === "string" && isIsoDate(sp.date) ? sp.date : istToday();

  const supabase = await createSupabaseServerClient();
  const [{ data: depts }, { data: recent }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("active", true).order("name"),
    supabase.from("collections").select("id, date, cash, card, upi, other, note, department_id, departments(name)")
      .order("date", { ascending: false }).limit(60).overrideTypes<Row[], { merge: false }>(),
  ]);
  const forDay = (recent ?? []).filter((r) => r.date === date);
  const total = (r: Row) => Number(r.cash) + Number(r.card) + Number(r.upi) + Number(r.other);

  return (
    <>
      <h1 className="text-2xl font-semibold">Daily collections</h1>
      <form className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Date</span>
          <input type="date" name="date" defaultValue={date} className={fieldClass} />
        </label>
        <button className="rounded-xl border border-zinc-300 px-4 py-2.5 dark:border-zinc-700">Go</button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        {(depts ?? []).map((d) => {
          const row = forDay.find((r) => r.department_id === d.id);
          const n = (x: string | undefined) => (x && Number(x) ? String(Number(x)) : "");
          return (
            <section key={`${d.id}-${date}`} className={cardClass}>
              <h2 className="font-semibold">{d.name}</h2>
              <ActionForm action={saveCollection} submitLabel={row ? "Update" : "Save"} className="mt-2 grid grid-cols-2 gap-2">
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="department_id" value={d.id} />
                {(["cash", "card", "upi", "other"] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-1">
                    <span className={labelClass}>{k === "upi" ? "UPI / GPay" : k[0].toUpperCase() + k.slice(1)}</span>
                    <input name={k} inputMode="decimal" defaultValue={n(row?.[k])} placeholder="0" className={fieldClass} />
                  </label>
                ))}
                <label className="col-span-2 flex flex-col gap-1">
                  <span className={labelClass}>Note</span>
                  <input name="note" defaultValue={row?.note ?? ""} className={fieldClass} />
                </label>
              </ActionForm>
            </section>
          );
        })}
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Recent</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr><th className="py-1 pr-3">Date</th><th className="pr-3">Dept</th><th className="pr-3 text-right">Cash</th><th className="pr-3 text-right">Card</th><th className="pr-3 text-right">UPI</th><th className="pr-3 text-right">Other</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {(recent ?? []).map((r) => (
                <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-1.5 pr-3">{r.date}</td><td className="pr-3">{r.departments?.name}</td>
                  <td className="pr-3 text-right">{formatINR(r.cash)}</td><td className="pr-3 text-right">{formatINR(r.card)}</td>
                  <td className="pr-3 text-right">{formatINR(r.upi)}</td><td className="pr-3 text-right">{formatINR(r.other)}</td>
                  <td className="text-right font-medium">{formatINR(total(r))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
