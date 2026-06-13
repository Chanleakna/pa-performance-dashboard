"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/lead-performance", label: "Lead Performance" },
  { href: "/", label: "Performance Measurement" },
];

export function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto max-w-6xl px-2">
      <ul className="no-scrollbar flex gap-1 overflow-x-auto pb-px">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
                className={
                  "block whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors " +
                  (active
                    ? "border-b-2 border-brand-600 text-brand-700"
                    : "border-b-2 border-transparent text-slate-500 hover:text-slate-800")
                }
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
