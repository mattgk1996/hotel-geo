import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cardClass, fieldClass } from "@/lib/ui";
import { ActionForm } from "@/components/action-form";
import { saveDepartment } from "../actions";

export default async function DepartmentsPage() {
  await requireRole("admin");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("departments").select("id, name, active").order("active", { ascending: false }).order("name");

  return (
    <>
      <div><Link href="/admin" className="text-sm text-zinc-500">← Masters</Link><h1 className="text-2xl font-semibold">Departments</h1></div>
      <ul className="flex flex-col gap-2">
        {(data ?? []).map((d) => (
          <li key={d.id} className={cardClass}>
            <ActionForm action={saveDepartment} submitLabel="Save" className="flex flex-wrap items-center gap-3" buttonClass="rounded-xl border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
              <input type="hidden" name="id" value={d.id} />
              <input name="name" defaultValue={d.name} required className={`${fieldClass} flex-1`} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={d.active} /> Active</label>
            </ActionForm>
          </li>
        ))}
      </ul>
      <section className={cardClass}>
        <h2 className="font-semibold">Add department</h2>
        <ActionForm action={saveDepartment} submitLabel="Add" resetOnSuccess className="mt-2 flex flex-col gap-3">
          <input name="name" required placeholder="e.g. Kitchen" className={fieldClass} />
        </ActionForm>
      </section>
    </>
  );
}
