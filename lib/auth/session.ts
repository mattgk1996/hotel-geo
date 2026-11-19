import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSessionTooOld } from "./session-age";
import { isRole, type Role } from "./roles";

export type CurrentStaff = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  departmentName: string | null;
};

/** The logged-in, active staff member, or null. Read once per request (Data Access Layer). */
export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || isSessionTooOld(claims)) return null;

  const { data: row } = await supabase
    .from("staff")
    .select("id, username, full_name, role, active, department_id, departments(name)")
    .eq("auth_user_id", claims.sub)
    .maybeSingle();
  if (!row || !row.active || !isRole(row.role)) return null;

  const dept = row.departments as { name: string } | { name: string }[] | null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    departmentId: row.department_id,
    departmentName: (Array.isArray(dept) ? dept[0]?.name : dept?.name) ?? null,
  };
});

export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

/** Use at the top of every page, Server Action and Route Handler that needs a role. */
export async function requireRole(...roles: Role[]): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (!roles.includes(staff.role)) redirect("/home");
  return staff;
}
