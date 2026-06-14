"use client";

import { useState } from "react";
import { monthLabel } from "../lib/parse";

/**
 * A multi-select dropdown (checkbox popover) — works well on phones. Empty
 * selection means "All". Closes when you tap outside.
 */
export function MultiSelectSlicer({
  label,
  values,
  options,
  onChange,
  formatOption,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (v: string[]) => void;
  formatOption?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const fmt = (v: string) => (formatOption ? formatOption(v) : v);
  const summary =
    values.length === 0
      ? "All"
      : values.length === 1
      ? fmt(values[0])
      : `${values.length} selected`;

  const toggle = (o: string) =>
    onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o]);

  return (
    <div className="relative min-w-0">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-left text-sm text-slate-800 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
      >
        <span className="truncate">{summary}</span>
        <span className="shrink-0 text-slate-400">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-1 max-h-64 w-full min-w-[170px] overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              All <span className="text-slate-400">clear</span>
            </button>
            <div className="my-1 border-t border-slate-100" />
            {options.map((o) => (
              <label
                key={o}
                className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={values.includes(o)}
                  onChange={() => toggle(o)}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="truncate text-slate-700">{fmt(o)}</span>
              </label>
            ))}
            {options.length === 0 && (
              <div className="px-2 py-2 text-xs text-slate-400">No options</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export interface SlicerState {
  years: string[]; // [] = all
  months: string[]; // [] = all (full month keys, e.g. "2026-01")
  asms: string[]; // [] = all (PATL / Team Leader)
  pas: string[]; // [] = all (PA name)
}

/**
 * Cascading multi-select Year / Month / PATL / PA slicers. Year narrows the
 * Month list; PATL (PA Team Leader) narrows the PA list. Every panel recomputes.
 */
export function CascadingSlicers({
  state,
  onChange,
  years,
  months,
  asms,
  pasForAsms,
  lockedAsm,
}: {
  state: SlicerState;
  onChange: (s: SlicerState) => void;
  years: string[];
  months: string[]; // full month keys
  asms: string[];
  /** PA names available for the selected PATLs ([] => every PA). */
  pasForAsms: (asms: string[]) => string[];
  /** When set, the PATL is fixed (locked to this Team Leader). */
  lockedAsm?: string;
}) {
  const monthsForYears = (ys: string[]) =>
    ys.length ? months.filter((m) => ys.some((y) => m.startsWith(y + "-"))) : months;

  const monthOptions = monthsForYears(state.years);
  const paOptions = pasForAsms(state.asms);

  return (
    <div className="sticky top-[97px] z-20 -mx-4 mb-3 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MultiSelectSlicer
          label="Year"
          values={state.years}
          options={years}
          onChange={(ys) => {
            // Prune months that no longer belong to the chosen years.
            const allowed = monthsForYears(ys);
            onChange({
              ...state,
              years: ys,
              months: state.months.filter((m) => allowed.includes(m)),
            });
          }}
        />
        <MultiSelectSlicer
          label="Month"
          values={state.months}
          options={monthOptions}
          formatOption={monthLabel}
          onChange={(ms) => onChange({ ...state, months: ms })}
        />
        {lockedAsm ? (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              PATL
            </span>
            <div className="flex w-full items-center gap-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-700">
              🔒 <span className="truncate">{lockedAsm}</span>
            </div>
          </label>
        ) : (
          <MultiSelectSlicer
            label="PATL"
            values={state.asms}
            options={asms}
            onChange={(a) => {
              // Prune PAs that no longer belong to the chosen team leaders.
              const allowedPas = pasForAsms(a);
              onChange({
                ...state,
                asms: a,
                pas: state.pas.filter((p) => allowedPas.includes(p)),
              });
            }}
          />
        )}
        <MultiSelectSlicer
          label="PA Name"
          values={state.pas}
          options={paOptions}
          onChange={(p) => onChange({ ...state, pas: p })}
        />
      </div>
    </div>
  );
}
