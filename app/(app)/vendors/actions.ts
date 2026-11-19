"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optStr, str, uuidOrNull, type FormState } from "@/lib/form";
import { isValidGstin } from "@/lib/gstin";

/** Adds a vendor (no id) or updates one. */
export async function saveVendor(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireRole("accounts", "admin");
  const id = uuidOrNull(fd, "id");
  const name = str(fd, "name");
  const gstin = str(fd, "gstin", 15).toUpperCase() || null;
  if (!name) return { ok: false, message: "Name is required." };
  if (gstin && !isValidGstin(gstin)) return { ok: false, message: "That GSTIN doesn't look right (check the digits)." };

  const row = {
    name,
    gstin,
    phone: optStr(fd, "phone", 20),
    default_head_id: uuidOrNull(fd, "default_head_id"),
    active: id ? fd.get("active") === "on" : true,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = id
    ? await supabase.from("vendors").update(row).eq("id", id)
    : await supabase.from("vendors").insert(row);
  if (error) {
    return { ok: false, message: error.code === "23505" ? "Another vendor already has that GSTIN." : `Couldn't save: ${error.message}` };
  }
  refresh();
  return { ok: true, message: id ? "Saved." : `Added ${name}.` };
}
