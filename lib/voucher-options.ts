import "server-only";
import type { CurrentStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DeptOption, FloatOption, HeadOption, VendorOption } from "@/components/voucher-form";

/** Pick-lists for the capture form: active heads, visible cash floats, vendors, departments (reviewers only). */
export async function loadVoucherOptions(staff: CurrentStaff) {
  const supabase = await createSupabaseServerClient();
  const [heads, floats, depts, vendors] = await Promise.all([
    supabase.from("expense_heads").select("id, code, name, group_name, direction").eq("active", true)
      .order("sort_order").order("name").overrideTypes<HeadOption[], { merge: false }>(),
    supabase.from("cash_floats").select("id, name, department_id").eq("active", true)
      .order("name").overrideTypes<FloatOption[], { merge: false }>(),
    staff.role === "staff"
      ? Promise.resolve({ data: null })
      : supabase.from("departments").select("id, name").eq("active", true)
          .order("name").overrideTypes<DeptOption[], { merge: false }>(),
    supabase.from("vendors").select("id, name, default_head_id").eq("active", true)
      .order("name").overrideTypes<VendorOption[], { merge: false }>(),
  ]);
  return { heads: heads.data ?? [], floats: floats.data ?? [], departments: depts.data ?? undefined, vendors: vendors.data ?? [] };
}
