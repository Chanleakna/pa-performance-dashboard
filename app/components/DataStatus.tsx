"use client";

import { SHEET_TABS, REFRESH_MS } from "../lib/config";
import type { UseDataResult } from "../lib/useData";

const TAB_LABELS: Record<string, string> = {
  daily: SHEET_TABS.daily.label,
  target: SHEET_TABS.target.label,
  nu: SHEET_TABS.nu.label,
  training: SHEET_TABS.training.label,
  sales: SHEET_TABS.sales.label,
  salesTarget: SHEET_TABS.salesTarget.label,
};

/**
 * Live status strip: shows refresh cadence, a manual refresh, and — crucially —
 * names any tab that failed to fetch so the user knows which one still needs
 * "Publish to web → CSV".
 */
export function DataStatus({ data }: { data: UseDataResult }) {
  const { errors, isLoading, updatedAt, refresh } = data;
  const errorKeys = Object.keys(errors) as Array<keyof typeof errors>;

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span
            className={
              "h-2 w-2 rounded-full " +
              (errorKeys.length
                ? "bg-amber-500"
                : isLoading
                ? "bg-slate-300"
                : "bg-emerald-500")
            }
          />
          {isLoading
            ? "Loading live data…"
            : errorKeys.length
            ? "Live — some tabs unavailable"
            : "Live"}
        </span>
        <span>· auto-refresh every {Math.round(REFRESH_MS / 1000)}s</span>
        {updatedAt && <span>· updated {updatedAt.toLocaleTimeString()}</span>}
        <button
          onClick={refresh}
          className="rounded border border-slate-200 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-50"
        >
          Refresh now
        </button>
      </div>

      {errorKeys.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <div className="font-semibold">
            {errorKeys.length} tab{errorKeys.length > 1 ? "s" : ""} could not be
            fetched:
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {errorKeys.map((k) => (
              <li key={k}>
                <span className="font-medium">{TAB_LABELS[k]}</span> — {errors[k]}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-[11px] text-amber-700">
            Fix: in Google Sheets, File → Share → Publish to web → select that
            tab → CSV. The site picks it up on the next refresh.
          </div>
        </div>
      )}
    </div>
  );
}

/** A simple full-page loading / empty state. */
export function LoadingState({ label = "Loading live data…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      <p className="mt-3 text-sm">{label}</p>
    </div>
  );
}
