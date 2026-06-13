"use client";

import { monthLabel } from "../lib/parse";

/** A single labeled <select> slicer. */
export function SelectSlicer({
  label,
  value,
  options,
  onChange,
  formatOption,
  allLabel = "All",
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  formatOption?: (v: string) => string;
  allLabel?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {formatOption ? formatOption(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface SlicerState {
  year: string; // "all" | "2025" | "2026"
  month: string; // "all" | monthKey (e.g. "2026-01")
  asm: string; // "all" | PATL (Team Leader) name
  pa: string; // "all" | PA name
}

/**
 * Cascading Year / Month / PATL / PA slicers. Year narrows the Month list;
 * PATL (PA Team Leader) narrows the PA list. Every panel recomputes off these.
 */
export function CascadingSlicers({
  state,
  onChange,
  years,
  months,
  asms,
  pasForAsm,
}: {
  state: SlicerState;
  onChange: (s: SlicerState) => void;
  years: string[];
  months: string[]; // full month keys, e.g. "2026-01"
  asms: string[];
  /** PA names available for the currently-selected PATL ("all" => every PA). */
  pasForAsm: (asm: string) => string[];
}) {
  // Month options narrow to the chosen year.
  const monthOptions =
    state.year === "all"
      ? months
      : months.filter((m) => m.startsWith(state.year + "-"));
  const paOptions = pasForAsm(state.asm);

  return (
    <div className="sticky top-[97px] z-20 -mx-4 mb-3 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SelectSlicer
          label="Year"
          value={state.year}
          options={years}
          onChange={(year) =>
            // Reset the month if it no longer belongs to the chosen year.
            onChange({
              ...state,
              year,
              month:
                year !== "all" && !state.month.startsWith(year + "-")
                  ? "all"
                  : state.month,
            })
          }
        />
        <SelectSlicer
          label="Month"
          value={state.month}
          options={monthOptions}
          formatOption={monthLabel}
          onChange={(month) => onChange({ ...state, month })}
        />
        <SelectSlicer
          label="PATL"
          value={state.asm}
          options={asms}
          onChange={(asm) =>
            // Reset PA when the team leader changes so the cascade stays valid.
            onChange({ ...state, asm, pa: "all" })
          }
        />
        <SelectSlicer
          label="PA Name"
          value={state.pa}
          options={paOptions}
          onChange={(pa) => onChange({ ...state, pa })}
        />
      </div>
    </div>
  );
}
