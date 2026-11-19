import { requireRole } from "@/lib/auth/session";
import { ROLE_LABELS, isRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AddStaffForm, ResetPinForm } from "./staff-forms";
import { setStaffActive } from "./actions";

type StaffRow = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  active: boolean;
  phone: string | null;
  auth_user_id: string | null;
  locked_until: string | null;
  departments: { name: string } | null;
};

export default async function StaffPage() {
  const me = await requireRole("admin");
  const supabase = await createSupabaseServerClient();

  const [{ data: staff }, { data: departments }] = await Promise.all([
    supabase
      .from("staff")
      .select("id, username, full_name, role, active, phone, auth_user_id, locked_until, departments(name)")
      .order("active", { ascending: false })
      .order("full_name")
      .overrideTypes<StaffRow[], { merge: false }>(),
    supabase.from("departments").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Staff</h1>

      <ul className="flex flex-col gap-3">
        {(staff ?? []).map((s) => {
          const locked = isLocked(s.locked_until);
          return (
            <li
              key={s.id}
              className={`rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800 ${s.active ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {s.full_name} <span className="text-sm font-normal text-zinc-500">@{s.username}</span>
                  </p>
                  <p className="text-sm text-zinc-500">
                    {isRole(s.role) ? ROLE_LABELS[s.role] : s.role}
                    {s.departments?.name ? ` · ${s.departments.name}` : ""}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-2 text-xs">
                    {!s.active && <Badge tone="zinc">Inactive</Badge>}
                    {locked && <Badge tone="red">Locked</Badge>}
                    {!s.auth_user_id && <Badge tone="amber">No login linked</Badge>}
                  </p>
                </div>
                {s.id !== me.id && (
                  <form action={setStaffActive}>
                    <input type="hidden" name="staff_id" value={s.id} />
                    <input type="hidden" name="active" value={String(!s.active)} />
                    <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700">
                      {s.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                )}
              </div>
              {s.active && s.auth_user_id && <ResetPinForm staffId={s.id} />}
            </li>
          );
        })}
      </ul>

      <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Add staff</h2>
        <AddStaffForm departments={departments ?? []} />
      </section>
    </>
  );
}

function isLocked(lockedUntil: string | null): boolean {
  return lockedUntil !== null && new Date(lockedUntil).getTime() > Date.now();
}

function Badge({ tone, children }: { tone: "zinc" | "red" | "amber"; children: React.ReactNode }) {
  const tones = {
    zinc: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
    red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  };
  return <span className={`rounded-full px-2 py-0.5 ${tones[tone]}`}>{children}</span>;
}
