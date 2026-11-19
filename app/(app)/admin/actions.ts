"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optStr, str, uuidOrNull, type FormState } from "@/lib/form";
import { isIsoDate, istToday, parseAmount } from "@/lib/vouchers";

const dupe = (e: { code?: string; message: string }, what: string): FormState => ({
  ok: false,
  message: e.code === "23505" ? `That ${what} already exists.` : `Couldn't save: ${e.message}`,
});

export async function saveDepartment(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireRole("admin");
  const id = uuidOrNull(fd, "id");
  const name = str(fd, "name", 60);
  if (!name) return { ok: false, message: "Name is required." };
  const supabase = await createSupabaseServerClient();
  const row = { name, active: id ? fd.get("active") === "on" : true };
  const { error } = id ? await supabase.from("departments").update(row).eq("id", id) : await supabase.from("departments").insert(row);
  if (error) return dupe(error, "department");
  refresh();
  return { ok: true, message: "Saved." };
}

export async function saveHead(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireRole("admin");
  const id = uuidOrNull(fd, "id");
  const name = str(fd, "name", 80);
  const group = str(fd, "group_name", 60);
  const direction = str(fd, "direction", 3);
  const sort = Number(str(fd, "sort_order", 6) || "0");
  if (!name || !group) return { ok: false, message: "Name and group are required." };
  if (direction !== "in" && direction !== "out") return { ok: false, message: "Pick expense or income." };
  if (!Number.isInteger(sort)) return { ok: false, message: "Sort order must be a whole number." };
  const hints = str(fd, "hints", 1000).split(",").map((h) => h.trim()).filter(Boolean);

  const row = {
    name, group_name: group, direction, sort_order: sort, hints,
    tally_ledger_name: optStr(fd, "tally_ledger_name", 120),
    active: id ? fd.get("active") === "on" : true,
  };
  const supabase = await createSupabaseServerClient();
  let error;
  if (id) {
    ({ error } = await supabase.from("expense_heads").update(row).eq("id", id));
  } else {
    const code = str(fd, "code", 20).toUpperCase();
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) return { ok: false, message: "Code: 2–20 letters, digits or dashes (e.g. FB-SNACK)." };
    ({ error } = await supabase.from("expense_heads").insert({ ...row, code }));
  }
  if (error) return dupe(error, "head code");
  refresh();
  return { ok: true, message: "Saved." };
}

export async function saveFloat(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireRole("admin");
  const id = uuidOrNull(fd, "id");
  const name = str(fd, "name", 60);
  const departmentId = uuidOrNull(fd, "department_id");
  const threshold = parseAmount(str(fd, "low_balance_threshold", 20) || "0");
  if (!name) return { ok: false, message: "Name is required." };
  if (!departmentId) return { ok: false, message: "Pick a department." };
  if (threshold === null) return { ok: false, message: "Low-balance alert must be an amount." };

  const row = {
    name, department_id: departmentId, low_balance_threshold: threshold,
    custodian_staff_id: uuidOrNull(fd, "custodian_staff_id"),
  };
  const supabase = await createSupabaseServerClient();
  let error;
  if (id) {
    ({ error } = await supabase.from("cash_floats").update({ ...row, active: fd.get("active") === "on" }).eq("id", id));
  } else {
    const opening = parseAmount(str(fd, "opening_amount", 20) || "0");
    if (opening === null) return { ok: false, message: "Opening amount must be an amount." };
    ({ error } = await supabase.from("cash_floats").insert({ ...row, opening_amount: opening, current_balance: opening }));
  }
  if (error) return dupe(error, "float");
  refresh();
  return { ok: true, message: "Saved." };
}

export async function addTopup(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("admin");
  const floatId = uuidOrNull(fd, "float_id");
  const amount = parseAmount(str(fd, "amount", 20));
  const date = str(fd, "date", 10) || istToday();
  if (!floatId) return { ok: false, message: "Pick a float." };
  if (!amount || amount <= 0) return { ok: false, message: "Enter the top-up amount." };
  if (!isIsoDate(date)) return { ok: false, message: "Enter a valid date." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("float_topups").insert({ float_id: floatId, amount, date, note: optStr(fd, "note", 300), given_by: me.id });
  if (error) return { ok: false, message: `Couldn't save: ${error.message}` };
  refresh();
  return { ok: true, message: "Top-up recorded." };
}
