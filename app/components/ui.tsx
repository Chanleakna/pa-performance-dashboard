"use client";

import { useState } from "react";
import { type AttainmentStatus, attainmentStatus } from "../lib/model";
import { fmtPct, statusClasses } from "../lib/format";

/** A small colored attainment pill. Red is used ONLY for below-target. */
export function AttainmentPill({
  pct,
  digits = 0,
}: {
  pct: number | null;
  digits?: number;
}) {
  const status: AttainmentStatus = attainmentStatus(pct);
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums " +
        statusClasses(status)
      }
    >
      {pct == null ? "n/a" : fmtPct(pct, digits)}
    </span>
  );
}

/** A KPI stat card. */
export function StatCard({
  label,
  value,
  sub,
  accent = "brand",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "brand" | "slate" | "teal" | "indigo";
}) {
  const ring = {
    brand: "ring-brand-100",
    slate: "ring-slate-100",
    teal: "ring-teal-100",
    indigo: "ring-indigo-100",
  }[accent];
  const text = {
    brand: "text-brand-700",
    slate: "text-slate-700",
    teal: "text-teal-700",
    indigo: "text-indigo-700",
  }[accent];
  return (
    <div className={`rounded-xl bg-white p-3 shadow-sm ring-1 ${ring}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${text}`}>{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/**
 * A collapsible card. Children are UNMOUNTED when collapsed (not just hidden)
 * to keep memory low on mobile Safari, per the spec.
 */
export function CollapsibleCard({
  title,
  subtitle,
  right,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-50"
        aria-expanded={open}
      >
        <span
          className={
            "shrink-0 text-slate-400 transition-transform " + (open ? "rotate-90" : "")
          }
          aria-hidden
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-800">
            {title}
          </span>
          {subtitle != null && (
            <span className="block truncate text-xs text-slate-500">{subtitle}</span>
          )}
        </span>
        {right != null && <span className="shrink-0">{right}</span>}
      </button>
      {open && <div className="border-t border-slate-100 px-3 py-3">{children}</div>}
    </div>
  );
}

/** Section heading used across pages. */
export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-2 mt-4 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold text-slate-800">{children}</h2>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
  );
}
