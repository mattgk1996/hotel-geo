import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cardClass, fieldClass, labelClass } from "@/lib/ui";
import { ActionForm } from "@/components/action-form";
import { HeadSelect, type HeadLite } from "@/components/head-select";
import { saveVendor } from "./actions";

type Vendor = { id: string; name: string; gstin: string | null; phone: string | null; default_head_id: string | null; active: boolean; expense_heads: { name: string } | null };

function VendorFields({ v, heads }: { v?: Vendor; heads: HeadLite[] }) {
  return (
    <>
      {v && <input type="hidden" name="id" value={v.id} />}
      <label className="flex flex-col gap-1"><span className={labelClass}>Name</span><input name="name" required defaultValue={v?.name} className={fieldClass} /></label>
      <label className="flex flex-col gap-1"><span className={labelClass}>GSTIN</span><input name="gstin" maxLength={15} autoCapitalize="characters" defaultValue={v?.gstin ?? ""} className={fieldClass} /></label>
      <label className="flex flex-col gap-1"><span className={labelClass}>Phone</span><input name="phone" type="tel" defaultValue={v?.phone ?? ""} className={fieldClass} /></label>
      <label className="flex flex-col gap-1"><span className={labelClass}>Default head</span><HeadSelect name="default_head_id" heads={heads} defaultValue={v?.default_head_id} /></label>
      {v && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={v.active} /> Active</label>}
    </>
  );
}

export default async function VendorsPage() {
  await requireRole("accounts", "admin");
  const supabase = await createSupabaseServerClient();
  const [{ data: vendors }, { data: heads }] = await Promise.all([
    supabase.from("vendors").select("id, name, gstin, phone, default_head_id, active, expense_heads(name)")
      .order("active", { ascending: false }).order("name").overrideTypes<Vendor[], { merge: false }>(),
    supabase.from("expense_heads").select("id, name, group_name").eq("active", true).eq("direction", "out").order("sort_order"),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Vendors</h1>
      <section className={cardClass}>
        <h2 className="font-semibold">Add vendor</h2>
        <ActionForm action={saveVendor} submitLabel="Add vendor" resetOnSuccess className="mt-2 grid gap-3 sm:grid-cols-2">
          <VendorFields heads={heads ?? []} />
        </ActionForm>
      </section>

      {!vendors?.length ? (
        <p className="text-sm text-zinc-500">No vendors yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vendors.map((v) => (
            <li key={v.id} className={`${cardClass} ${v.active ? "" : "opacity-60"}`}>
              <details>
                <summary className="cursor-pointer list-none">
                  <p className="font-medium">{v.name}</p>
                  <p className="text-xs text-zinc-500">
                    {[v.gstin, v.phone, v.expense_heads?.name && `Default: ${v.expense_heads.name}`, !v.active && "Inactive"].filter(Boolean).join(" · ") || "Tap to edit"}
                  </p>
                </summary>
                <ActionForm action={saveVendor} submitLabel="Save" className="mt-3 grid gap-3 sm:grid-cols-2">
                  <VendorFields v={v} heads={heads ?? []} />
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
