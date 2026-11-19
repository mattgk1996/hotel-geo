"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optStr, str, uuidOrNull, type FormState } from "@/lib/form";

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
