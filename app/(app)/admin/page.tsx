import Link from "next/link";
import { requireRole } from "@/lib/auth/session";

const LINKS = [
  { href: "/admin/staff", title: "Staff", text: "Add staff, reset PINs, deactivate." },
  { href: "/admin/departments", title: "Departments", text: "Add or rename departments." },
  { href: "/admin/heads", title: "Expense heads", text: "Codes, names, groups and keyword hints." },
  { href: "/admin/floats", title: "Cash floats", text: "Petty cash floats, balances and top-ups." },
  { href: "/vendors", title: "Vendors", text: "GSTINs and default heads." },
];

export default async function MastersPage() {
  await requireRole("admin");
  return (
    <>
      <h1 className="text-2xl font-semibold">Masters</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block rounded-2xl border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
              <p className="font-semibold">{l.title}</p>
              <p className="text-sm text-zinc-500">{l.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
