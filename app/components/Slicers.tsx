"use client";

import { monthLabel } from "../lib/parse";

/** A single labeled <select> slicer. */
export function SelectSlicer({
  label,
  value,
  options,
  onChange,
  formatOption,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  formatOption?: (v: string) => string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
      >
        <option value="all">All</option>
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
  month: string; // "all" | monthKey
  asm: string; // "all" | asm name
  pa: string; // "all" | PA name
}

/**
 * Cascading Month / Team Leader / PA slicers. Choosing a Team Leader narrows
 * the PA list; clearing keeps the selection consistent.
 */
export function CascadingSlicers({
  state,
  onChange,
  months,
  asms,
  pasForAsm,
}: {
  state: SlicerState;
  onChange: (s: SlicerState) => void;
  months: string[];
  asms: string[];
  /** PA names available for the currently-selected ASM ("all" => every PA). */
  pasForAsm: (asm: string) => string[];
}) {
  const paOptions = pasForAsm(state.asm);

  return (
    <div className="sticky top-[97px] z-20 -mx-4 mb-3 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
      <div className="flex gap-2">
        <SelectSlicer
          label="Month"
          value={state.month}
          options={months}
          formatOption={monthLabel}
          onChange={(month) => onChange({ ...state, month })}
        />
        <SelectSlicer
          label="Team Leader"
          value={state.asm}
          options={asms}
          onChange={(asm) =>
            // Reset PA when the team leader changes so the cascade stays valid.
            onChange({ ...state, asm, pa: "all" })
          }
        />
        <SelectSlicer
          label="PA"
          value={state.pa}
          options={paOptions}
          onChange={(pa) => onChange({ ...state, pa })}
        />
      </div>
    </div>
  );
}
