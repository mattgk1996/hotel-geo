"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optStr, str, uuidOrNull, type FormState } from "@/lib/form";
import { isIsoDate, parseAmount } from "@/lib/vouchers";

/** Saves (or corrects) one department's collections for one day. */
export async function saveCollection(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("accounts", "admin");
  const date = str(fd, "date", 10);
  const departmentId = uuidOrNull(fd, "department_id");
  if (!isIsoDate(date)) return { ok: false, message: "Pick a date." };
  if (!departmentId) return { ok: false, message: "Pick a department." };

  const amounts: Record<string, number> = {};
  for (const k of ["cash", "card", "upi", "other"]) {
    const raw = str(fd, k, 20);
    const n = raw === "" ? 0 : parseAmount(raw);
    if (n === null) return { ok: false, message: `${k.toUpperCase()} must be a number like 12500 or 12500.50.` };
    amounts[k] = n;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("collections")
    .upsert({ date, department_id: departmentId, ...amounts, note: optStr(fd, "note", 500), entered_by: me.id }, { onConflict: "date,department_id" });
  if (error) return { ok: false, message: `Couldn't save: ${error.message}` };
  refresh();
  return { ok: true, message: "Saved." };
}
