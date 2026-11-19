import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cardClass, fieldClass, labelClass } from "@/lib/ui";
import { ActionForm } from "@/components/action-form";
import { saveHead } from "../actions";

type Head = { id: string; code: string; name: string; group_name: string; hints: string[]; direction: "in" | "out"; tally_ledger_name: string | null; active: boolean; sort_order: number };

function HeadFields({ h }: { h?: Head }) {
  return (
    <>
      {h ? <input type="hidden" name="id" value={h.id} /> : (
        <label className="flex flex-col gap-1"><span className={labelClass}>Code</span><input name="code" required placeholder="FB-SNACK" autoCapitalize="characters" className={fieldClass} /></label>
      )}
      <label className="flex flex-col gap-1"><span className={labelClass}>Name</span><input name="name" required defaultValue={h?.name} className={fieldClass} /></label>
      <label className="flex flex-col gap-1"><span className={labelClass}>Group</span><input name="group_name" required defaultValue={h?.group_name} className={fieldClass} /></label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Kind</span>
        <select name="direction" defaultValue={h?.direction ?? "out"} className={fieldClass}>
          <option value="out">Expense (money out)</option>
          <option value="in">Income (money in)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2"><span className={labelClass}>Keyword hints (comma-separated)</span><input name="hints" defaultValue={h?.hints.join(", ")} className={fieldClass} /></label>
      <label className="flex flex-col gap-1"><span className={labelClass}>Sort order</span><input name="sort_order" inputMode="numeric" defaultValue={h?.sort_order ?? 0} className={fieldClass} /></label>
      <label className="flex flex-col gap-1"><span className={labelClass}>Tally ledger (Stage C)</span><input name="tally_ledger_name" defaultValue={h?.tally_ledger_name ?? ""} className={fieldClass} /></label>
      {h && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={h.active} /> Active</label>}
    </>
  );
}

export default async function HeadsPage() {
  await requireRole("admin");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("expense_heads")
    .select("id, code, name, group_name, hints, direction, tally_ledger_name, active, sort_order")
    .order("sort_order").order("name").overrideTypes<Head[], { merge: false }>();
  const heads = data ?? [];
  const groups = [...new Set(heads.map((h) => h.group_name))];

  return (
    <>
      <div><Link href="/admin" className="text-sm text-zinc-500">← Masters</Link><h1 className="text-2xl font-semibold">Expense heads</h1></div>
      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-2 font-semibold">{g}</h2>
          <ul className="flex flex-col gap-2">
            {heads.filter((h) => h.group_name === g).map((h) => (
              <li key={h.id} className={`${cardClass} ${h.active ? "" : "opacity-60"}`}>
                <details>
                  <summary className="cursor-pointer list-none">
                    <span className="font-medium">{h.name}</span> <span className="text-xs text-zinc-500">{h.code}{h.active ? "" : " · inactive"}</span>
                    {h.hints.length > 0 && <p className="text-xs text-zinc-500">{h.hints.join(", ")}</p>}
                  </summary>
                  <ActionForm action={saveHead} submitLabel="Save" className="mt-3 grid gap-3 sm:grid-cols-2">
                    <HeadFields h={h} />
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className={cardClass}>
        <h2 className="font-semibold">Add head</h2>
        <ActionForm action={saveHead} submitLabel="Add head" resetOnSuccess className="mt-2 grid gap-3 sm:grid-cols-2">
          <HeadFields />
        </ActionForm>
      </section>
    </>
  );
}
