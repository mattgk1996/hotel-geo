"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  // The most specific matching item is active (so /vouchers/new doesn't also light up /vouchers).
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="mx-auto w-full max-w-3xl overflow-x-auto px-4 py-2">
      <ul className="flex gap-2 whitespace-nowrap">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={active === i.href ? "page" : undefined}
              className={`inline-block rounded-full px-3 py-1.5 text-sm ${
                active === i.href
                  ? "bg-emerald-700 text-white"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
