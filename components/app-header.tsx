import Link from "next/link";
import { logout } from "@/app/login/actions";
import { navForRole, ROLE_LABELS } from "@/lib/auth/roles";
import type { CurrentStaff } from "@/lib/auth/session";
import { NavLinks } from "./nav-links";

export function AppHeader({ staff }: { staff: CurrentStaff }) {
  const items = navForRole(staff.role).map(({ href, label }) => ({ href, label }));
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-[var(--background)]/95 backdrop-blur dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-3">
        <Link href="/home" className="font-semibold text-emerald-800 dark:text-emerald-400">
          Hotel Geo
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/account/pin" className="text-right leading-tight">
            <span className="block font-medium">{staff.fullName}</span>
            <span className="block text-xs text-zinc-500">
              {ROLE_LABELS[staff.role]}
              {staff.departmentName ? ` · ${staff.departmentName}` : ""}
            </span>
          </Link>
          <form action={logout}>
            <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700">
              Log out
            </button>
          </form>
        </div>
      </div>
      <NavLinks items={items} />
    </header>
  );
}
