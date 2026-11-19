import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STATUS_LABELS } from "@/lib/vouchers";

type Entry = {
  id: string;
  action: string;
  at: string;
  after: Record<string, unknown> | null;
  actor: { full_name: string } | null;
};

const HIDDEN = new Set(["status", "reviewed_by", "reviewed_at", "accounts_note", "staff_note", "flags"]);
const FIELD_LABELS: Record<string, string> = {
  total_amount: "amount", voucher_date: "date", head_id: "head", vendor_name_raw: "vendor", vendor_id: "vendor",
  payment_mode: "payment mode", invoice_number: "invoice no.", type: "type",
};

const when = new Intl.DateTimeFormat("en-IN", {
  timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
});

/** Status changes, edits and the query/reply thread for one voucher, from audit_log. */
export async function VoucherHistory({ voucherId }: { voucherId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, at, after, actor:staff(full_name)")
    .eq("entity", "vouchers")
    .eq("entity_id", voucherId)
    .order("at", { ascending: true })
    .overrideTypes<Entry[], { merge: false }>();
  if (!data?.length) return null;

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">History</h2>
      <ol className="flex flex-col gap-2 border-l-2 border-zinc-200 pl-4 text-sm dark:border-zinc-800">
        {data.map((e) => {
          const after = e.after ?? {};
          const status = e.action.startsWith("status:") ? e.action.split("->")[1] : null;
          const title = e.action === "create" ? "Created" : status ? STATUS_LABELS[status] ?? status : "Edited";
          const edited = [...new Set(Object.keys(after).filter((k) => !HIDDEN.has(k) && FIELD_LABELS[k]).map((k) => FIELD_LABELS[k]))];
          const accountsNote = e.action !== "create" && typeof after.accounts_note === "string" ? after.accounts_note : null;
          const staffNote = typeof after.staff_note === "string" ? after.staff_note : null;
          return (
            <li key={e.id}>
              <p>
                <span className="font-medium">{title}</span>
                {e.action !== "create" && edited.length > 0 && <span className="text-zinc-500"> · changed {edited.join(", ")}</span>}
              </p>
              <p className="text-xs text-zinc-500">{when.format(new Date(e.at))} · {e.actor?.full_name ?? "Accounts"}</p>
              {accountsNote && <p className="mt-1 rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">{accountsNote}</p>}
              {staffNote && <p className="mt-1 rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900">{staffNote}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
