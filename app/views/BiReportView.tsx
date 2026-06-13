"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useDashboardData } from "../lib/useData";
import {
  filteredDaily,
  filteredNU,
  actLeadForPaMonth,
  tarLeadForPaMonth,
  targetLeadForPaMonth,
  tarLeadForScopeMonth,
  sumTargetField,
  storesForPa,
  type DashboardModel,
  type Filter,
} from "../lib/model";
import { monthLabel, type MonthKey } from "../lib/parse";
import { fmtInt, fmtPct } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import { DataStatus, LoadingState } from "../components/DataStatus";
import { AttainmentPill, CollapsibleCard } from "../components/ui";
import { CascadingSlicers, type SlicerState } from "../components/Slicers";
import {
  GroupedBarChart,
  HorizontalLabeledBar,
  DailyTrendChart,
} from "../components/charts";

// ---- small presentational helpers -------------------------------------------

/** Small CSV export button; computes rows lazily on click. */
function ExportButton({
  rows,
  name,
}: {
  rows: () => Record<string, unknown>[];
  name: string;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(name, rows())}
      className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 hover:bg-brand-50"
      title="Download this section as CSV"
    >
      ⬇ CSV
    </button>
  );
}

function Panel({
  title,
  hint,
  children,
  className = "",
  exportRows,
  exportName,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  exportRows?: () => Record<string, unknown>[];
  exportName?: string;
}) {
  return (
    <div className={"rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100 " + className}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
          {exportRows && <ExportButton rows={exportRows} name={exportName || title} />}
        </div>
      </div>
      {children}
    </div>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg bg-brand-600 p-2.5 text-white">
      <div className="text-[10px] font-medium uppercase tracking-wide text-brand-100">
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-brand-100">{sub}</div>}
    </div>
  );
}

// ---- heatmap -----------------------------------------------------------------

// Fixed daily-lead target benchmark (absolute leads per working day, per PA).
const DAILY_TARGET = 3;

interface HeatRow {
  pa: string;
  m: Map<string, number>;
  actual: number;
  target: number;
  dailyTarget: number;
  pct: number | null;
}

/** Compute the PA × day grid (shared by the heatmap and its CSV export). */
function computeHeatmapData(
  model: DashboardModel,
  filter: Filter,
  summaryMonths: MonthKey[]
): { cols: { key: string; label: string }[]; rows: HeatRow[]; max: number } {
  const daily = filteredDaily(model, filter);

  // Always a daily trend: columns are day-of-month (1, 2, 3 …), aggregated
  // across whatever months are in scope. Never month columns.
  let maxDay = 0;
  const byPa = new Map<string, Map<string, number>>();
  for (const d of daily) {
    if (!d.paName || !d.createdAt) continue;
    const day = d.createdAt.getDate();
    if (day > maxDay) maxDay = day;
    const colKey = String(day);
    let inner = byPa.get(d.paName);
    if (!inner) {
      inner = new Map();
      byPa.set(d.paName, inner);
    }
    inner.set(colKey, (inner.get(colKey) || 0) + 1);
  }
  if (maxDay === 0) maxDay = 31;
  const cols = Array.from({ length: maxDay }, (_, i) => ({
    key: String(i + 1),
    label: String(i + 1),
  }));

  const rows: HeatRow[] = Array.from(byPa.entries())
    .map(([pa, m]) => {
      const actual = Array.from(m.values()).reduce((a, b) => a + b, 0);
      let target = 0;
      for (const mk of summaryMonths) target += tarLeadForPaMonth(model, pa, mk);
      const pct = target > 0 ? (actual / target) * 100 : null;
      return { pa, m, actual, target, dailyTarget: DAILY_TARGET, pct };
    })
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 30);

  const max = rows.reduce(
    (mx, r) => Math.max(mx, ...Array.from(r.m.values())),
    1
  );
  return { cols, rows, max };
}

/** CSV rows for the PA × day heatmap. */
function heatmapExport(
  model: DashboardModel,
  filter: Filter,
  summaryMonths: MonthKey[]
): Record<string, unknown>[] {
  const { cols, rows } = computeHeatmapData(model, filter, summaryMonths);
  return rows.map((r) => {
    const out: Record<string, unknown> = { PA: r.pa };
    for (const c of cols) out[`D${c.label}`] = r.m.get(c.key) || 0;
    out["Actual"] = r.actual;
    out["Daily Target"] = r.dailyTarget;
    out["%"] = r.pct == null ? "" : Math.round(r.pct);
    return out;
  });
}

function HeatMap({
  model,
  filter,
  summaryMonths,
}: {
  model: DashboardModel;
  filter: Filter;
  /** Months over which Actual/Target/% are rolled up (apple-to-apple). */
  summaryMonths: MonthKey[];
}) {
  const { cols, rows, max } = useMemo(
    () => computeHeatmapData(model, filter, summaryMonths),
    [model, filter, summaryMonths]
  );
  const [sortKey, setSortKey] = useState<"pa" | "act" | "pct">("act");
  const [asc, setAsc] = useState(false);
  const sortedRows = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "pa") return a.pa.localeCompare(b.pa) * dir;
      if (sortKey === "pct") return (nullable(a.pct) - nullable(b.pct)) * dir;
      return (a.actual - b.actual) * dir;
    });
  }, [rows, sortKey, asc]);

  if (rows.length === 0)
    return <p className="py-6 text-center text-xs text-slate-400">No leads in scope.</p>;

  const setSort = (k: "pa" | "act" | "pct") => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "pa");
    }
  };
  const hd = "sticky top-0 z-20 cursor-pointer select-none bg-white px-1 text-right font-semibold text-slate-500 hover:text-brand-700";

  return (
    <div className="no-scrollbar max-h-[70vh] overflow-auto">
      <table className="border-separate border-spacing-0.5 text-[10px]">
        <thead>
          <tr>
            <th
              onClick={() => setSort("pa")}
              className="sticky left-0 top-0 z-30 cursor-pointer select-none bg-white pr-2 text-left font-medium text-slate-400 hover:text-brand-700"
            >
              # · PA · Store
              <SortCaret active={sortKey === "pa"} asc={asc} />
            </th>
            {cols.map((c) => (
              <th key={c.key} className="sticky top-0 z-20 bg-white px-0.5 font-medium text-slate-400">
                {c.label}
              </th>
            ))}
            <th onClick={() => setSort("act")} className={hd}>
              Act<SortCaret active={sortKey === "act"} asc={asc} />
            </th>
            <th className="sticky top-0 z-20 bg-white px-1 text-right font-semibold text-slate-500">Day&nbsp;Tgt</th>
            <th onClick={() => setSort("pct")} className={hd}>
              %<SortCaret active={sortKey === "pct"} asc={asc} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r, ri) => {
            const dt = r.dailyTarget;
            return (
            <tr key={r.pa}>
              <td className="sticky left-0 z-10 max-w-[150px] truncate bg-white pr-2">
                <div className="text-slate-700">
                  <span className="text-slate-400">#{ri + 1}</span> {r.pa}
                </div>
                <div className="truncate text-[9px] text-slate-400">
                  {storesForPa(model, r.pa) || "—"}
                </div>
              </td>
              {cols.map((c) => {
                const v = r.m.get(c.key) || 0;
                // Benchmark each day against the daily target (monthly ÷ 24):
                // green = met the daily target, red = below it, blank = no work.
                let bg = "#f8fafc";
                let color = "#94a3b8";
                if (v > 0) {
                  if (dt > 0 && v >= dt) {
                    const i = Math.min(v / dt - 1, 1);
                    bg = `rgba(22, 163, 74, ${0.3 + 0.45 * i})`;
                    color = i > 0.4 ? "#fff" : "#14532d";
                  } else if (dt > 0) {
                    const i = 1 - v / dt;
                    bg = `rgba(239, 68, 68, ${0.25 + 0.5 * i})`;
                    color = i > 0.55 ? "#fff" : "#7f1d1d";
                  } else {
                    bg = `rgba(148, 163, 184, ${0.15 + 0.5 * (v / max)})`;
                    color = "#334155";
                  }
                }
                return (
                  <td
                    key={c.key}
                    title={`${r.pa} · day ${c.label}: ${v} vs daily target ${dt.toFixed(1)}`}
                    className="h-5 w-5 min-w-[20px] rounded text-center text-[9px]"
                    style={{ backgroundColor: bg, color }}
                  >
                    {v || ""}
                  </td>
                );
              })}
              <td className="px-1 text-right font-semibold tabular-nums text-slate-700">
                {fmtInt(r.actual)}
              </td>
              <td className="px-1 text-right tabular-nums text-slate-500">
                {fmtInt(dt)}
              </td>
              <td className="px-1 text-right">
                <AttainmentPill pct={r.pct} />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">
        Columns = day of month. Each day cell is benchmarked against a fixed{" "}
        <span className="font-medium">daily target of {DAILY_TARGET}</span> leads:{" "}
        <span className="font-medium text-emerald-700">green</span> = met that
        day (≥{DAILY_TARGET}), <span className="font-medium text-red-700">red</span>{" "}
        = below. Act = total actual, Day&nbsp;Tgt = daily target, % = actual ÷
        monthly target.
      </p>
    </div>
  );
}

// ---- Attainment % by PA (Actual ÷ Target, amber heatmap, by month) -----------

/** Amber cell background scaled by attainment %. Null target => neutral. */
function attainStyle(pct: number | null): React.CSSProperties {
  if (pct == null) return { backgroundColor: "#f1f5f9", color: "#94a3b8" };
  if (pct >= 100) {
    // Achieved — green, deeper the further above target.
    const i = Math.min((pct - 100) / 100, 1);
    return {
      backgroundColor: `rgba(22, 163, 74, ${0.2 + 0.6 * i})`,
      color: i > 0.45 ? "#fff" : "#14532d",
    };
  }
  // Below target — red, deeper the further below.
  const i = Math.min((100 - pct) / 100, 1);
  return {
    backgroundColor: `rgba(220, 38, 38, ${0.18 + 0.62 * i})`,
    color: i > 0.5 ? "#fff" : "#7f1d1d",
  };
}

/** Inner content of an attainment cell: % on top, Actual/Target beneath. */
function attainCell(pct: number | null, a: number, t: number) {
  return t > 0 ? (
    <div className="leading-tight">
      <div className="font-semibold">{Math.round(pct as number)}%</div>
      <div className="text-[9px] opacity-80">
        {fmtInt(a)}/{fmtInt(t)}
      </div>
    </div>
  ) : (
    "—"
  );
}

/** Sort key for the attainment heatmaps: name, grand total, or a month index. */
type AttSort = "name" | "total" | number;
function nullable(v: number | null): number {
  return v == null ? -1 : v;
}
/** Little ▲/▼ indicator. */
function SortCaret({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <span className="ml-0.5 text-slate-300">↕</span>;
  return <span className="ml-0.5 text-brand-600">{asc ? "▲" : "▼"}</span>;
}

/** Combined attainment % for a set of PAs over months (Σactual ÷ Σtarget). */
function combinedAttainment(
  model: DashboardModel,
  pas: { name: string }[],
  months: MonthKey[]
): number | null {
  let a = 0;
  let t = 0;
  for (const p of pas) {
    for (const m of months) {
      const tt = targetLeadForPaMonth(model, p.name, m);
      if (tt > 0) {
        t += tt;
        a += actLeadForPaMonth(model, p.name, m);
      }
    }
  }
  return t > 0 ? (a / t) * 100 : null;
}

/** A small attainment % badge using the same green/red scale as the heatmap. */
function AttainBadge({ pct }: { pct: number | null }) {
  return (
    <span
      style={attainStyle(pct)}
      className="rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums"
    >
      {pct == null ? "n/a" : `${Math.round(pct)}%`}
    </span>
  );
}

interface AttainRow {
  name: string;
  asm: string;
  cells: { t: number; a: number; pct: number | null }[];
  tTot: number;
  aTot: number;
  pctTot: number | null;
}

/** Compute the attainment matrix (shared by the heatmap and CSV export). */
function computeAttainmentData(
  model: DashboardModel,
  pas: { name: string; asm: string }[],
  months: MonthKey[]
) {
  const rows: AttainRow[] = pas
    .map((p) => {
      const cells = months.map((m) => {
        // Use Tar.Lead, or Quali.Lead where Tar.Lead is absent (March).
        const t = targetLeadForPaMonth(model, p.name, m);
        const a = actLeadForPaMonth(model, p.name, m);
        return { t, a, pct: t > 0 ? (a / t) * 100 : null };
      });
      const tTot = cells.reduce((s, c) => s + c.t, 0);
      const aTot = cells.reduce((s, c) => s + c.a, 0);
      const pctTot = tTot > 0 ? (aTot / tTot) * 100 : null;
      return { name: p.name, asm: p.asm, cells, tTot, aTot, pctTot };
    })
    .filter((r) => r.tTot > 0)
    .sort((a, b) => b.tTot - a.tTot)
    .slice(0, 150);

  const totalsByMonth = months.map((_, i) => {
    let a = 0;
    let t = 0;
    for (const r of rows) {
      a += r.cells[i].a;
      t += r.cells[i].t;
    }
    return { a, t, pct: t > 0 ? (a / t) * 100 : null };
  });
  let A = 0;
  let T = 0;
  for (const r of rows) {
    A += r.aTot;
    T += r.tTot;
  }
  const grand = { a: A, t: T, pct: T > 0 ? (A / T) * 100 : null };
  return { rows, totalsByMonth, grand };
}

/** CSV rows for the attainment matrix (% with Actual/Target per month). */
function attainmentExport(
  model: DashboardModel,
  pas: { name: string; asm: string }[],
  months: MonthKey[]
): Record<string, unknown>[] {
  const { rows } = computeAttainmentData(model, pas, months);
  const pctStr = (p: number | null) => (p == null ? "" : Math.round(p));
  return rows.map((r) => {
    const out: Record<string, unknown> = { PA: r.name, "Team Leader": r.asm };
    months.forEach((m, i) => {
      out[`${monthLabel(m)} %`] = pctStr(r.cells[i].pct);
      out[`${monthLabel(m)} Act`] = r.cells[i].a;
      out[`${monthLabel(m)} Tgt`] = r.cells[i].t;
    });
    out["Total Act"] = r.aTot;
    out["Total Tgt"] = r.tTot;
    out["Total %"] = pctStr(r.pctTot);
    return out;
  });
}

function AttainmentHeatmap({
  model,
  pas,
  months,
}: {
  model: DashboardModel;
  pas: { name: string; asm: string }[];
  months: MonthKey[];
}) {
  const { rows, totalsByMonth, grand } = useMemo(
    () => computeAttainmentData(model, pas, months),
    [model, pas, months]
  );
  const [sortKey, setSortKey] = useState<AttSort>("total");
  const [asc, setAsc] = useState(false);

  const sortedRows = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      const av = sortKey === "total" ? a.pctTot : a.cells[sortKey].pct;
      const bv = sortKey === "total" ? b.pctTot : b.cells[sortKey].pct;
      return (nullable(av) - nullable(bv)) * dir;
    });
  }, [rows, sortKey, asc]);

  if (months.length === 0)
    return (
      <p className="py-6 text-center text-xs text-slate-400">
        No target months in scope.
      </p>
    );

  const setSort = (k: AttSort) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "name");
    }
  };
  const cellCls = "whitespace-nowrap rounded px-1.5 py-1 text-right tabular-nums";
  const headCls = cellCls + " sticky top-0 z-20 cursor-pointer select-none bg-white font-medium hover:text-brand-700";
  const nameBody =
    "sticky left-0 z-10 max-w-[150px] truncate bg-white px-1.5 py-1 text-left";

  return (
    <div className="no-scrollbar max-h-[70vh] overflow-auto">
      <table className="border-separate border-spacing-0.5 text-[11px]">
        <thead>
          <tr className="text-slate-400">
            <th
              onClick={() => setSort("name")}
              className="sticky left-0 top-0 z-30 cursor-pointer select-none bg-white px-1.5 py-1 text-left font-medium hover:text-brand-700"
            >
              # · PA · Store
              <SortCaret active={sortKey === "name"} asc={asc} />
            </th>
            {months.map((m, i) => (
              <th key={m} onClick={() => setSort(i)} className={headCls}>
                {monthLabel(m).replace(" 20", " '")}
                <SortCaret active={sortKey === i} asc={asc} />
              </th>
            ))}
            <th
              onClick={() => setSort("total")}
              className={headCls + " font-semibold text-slate-500"}
            >
              Total
              <SortCaret active={sortKey === "total"} asc={asc} />
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Accumulated attainment of all PAs together. */}
          <tr className="font-semibold">
            <td className={nameBody + " text-amber-800"}>Total (all PAs)</td>
            {totalsByMonth.map((t, i) => (
              <td key={i} className={cellCls} style={attainStyle(t.pct)}>
                {attainCell(t.pct, t.a, t.t)}
              </td>
            ))}
            <td className={cellCls} style={attainStyle(grand.pct)}>
              {attainCell(grand.pct, grand.a, grand.t)}
            </td>
          </tr>
          {sortedRows.map((r, ri) => (
            <tr key={r.name}>
              <td className={nameBody} title={`${r.name} · ${r.asm} · ${storesForPa(model, r.name)}`}>
                <div className="text-slate-700">
                  <span className="text-slate-400">#{ri + 1}</span> {r.name}
                </div>
                <div className="truncate text-[9px] text-slate-400">
                  {storesForPa(model, r.name) || "—"}
                </div>
              </td>
              {r.cells.map((c, i) => (
                <td key={i} className={cellCls} style={attainStyle(c.pct)}>
                  {attainCell(c.pct, c.a, c.t)}
                </td>
              ))}
              <td className={cellCls + " font-medium"} style={attainStyle(r.pctTot)}>
                {attainCell(r.pctTot, r.aTot, r.tTot)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">
        Each cell shows <span className="font-medium">attainment %</span> with{" "}
        <span className="font-medium">Actual / Target</span> beneath (daily Actual ÷
        target). <span className="font-medium text-emerald-700">Green</span> = at or
        above target (≥100%); <span className="font-medium text-red-700">red</span> =
        below. All target months are shown (Year/PATL/PA still filter); March uses
        its Quali.Lead as target. Top row is all PAs combined.
      </p>
    </div>
  );
}

// ---- % Attainment by PATL (monthly heatmap, expand a team to its PAs) --------

function AttainmentByPatl({
  model,
  teams,
  months,
}: {
  model: DashboardModel;
  teams: [string, { name: string; asm: string }[]][];
  months: MonthKey[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<AttSort>("total");
  const [asc, setAsc] = useState(false);

  const teamRows = useMemo(() => {
    return teams.map(([asm, pas]) => {
      const monthCells = months.map((m) => {
        let a = 0;
        let t = 0;
        for (const p of pas) {
          const tt = targetLeadForPaMonth(model, p.name, m);
          if (tt > 0) {
            t += tt;
            a += actLeadForPaMonth(model, p.name, m);
          }
        }
        return { a, t, pct: t > 0 ? (a / t) * 100 : null };
      });
      let A = 0;
      let T = 0;
      for (const c of monthCells) {
        A += c.a;
        T += c.t;
      }
      return {
        asm,
        pas,
        paCount: pas.length,
        monthCells,
        total: { a: A, t: T, pct: T > 0 ? (A / T) * 100 : null },
      };
    });
  }, [model, teams, months]);

  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...teamRows].sort((a, b) => {
      if (sortKey === "name") return a.asm.localeCompare(b.asm) * dir;
      const av = sortKey === "total" ? a.total.pct : a.monthCells[sortKey].pct;
      const bv = sortKey === "total" ? b.total.pct : b.monthCells[sortKey].pct;
      return (nullable(av) - nullable(bv)) * dir;
    });
  }, [teamRows, sortKey, asc]);

  if (months.length === 0)
    return (
      <p className="py-6 text-center text-xs text-slate-400">
        No target months in scope.
      </p>
    );

  const setSort = (k: AttSort) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "name");
    }
  };
  const toggle = (asm: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(asm) ? n.delete(asm) : n.add(asm);
      return n;
    });

  const cellCls = "whitespace-nowrap rounded px-1.5 py-1 text-right tabular-nums";
  const headCls =
    cellCls + " sticky top-0 z-20 cursor-pointer select-none bg-white font-medium hover:text-brand-700";
  const nameBody = "sticky left-0 z-10 max-w-[170px] truncate bg-white px-1.5 py-1 text-left";

  return (
    <div className="no-scrollbar max-h-[70vh] overflow-auto">
      <table className="border-separate border-spacing-0.5 text-[11px]">
        <thead>
          <tr className="text-slate-400">
            <th
              onClick={() => setSort("name")}
              className="sticky left-0 top-0 z-30 cursor-pointer select-none bg-white px-1.5 py-1 text-left font-medium hover:text-brand-700"
            >
              Team Leader
              <SortCaret active={sortKey === "name"} asc={asc} />
            </th>
            {months.map((m, i) => (
              <th key={m} onClick={() => setSort(i)} className={headCls}>
                {monthLabel(m).replace(" 20", " '")}
                <SortCaret active={sortKey === i} asc={asc} />
              </th>
            ))}
            <th
              onClick={() => setSort("total")}
              className={headCls + " font-semibold text-slate-500"}
            >
              Total
              <SortCaret active={sortKey === "total"} asc={asc} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((tr) => (
            <Fragment key={tr.asm}>
              <tr
                className="cursor-pointer font-semibold hover:bg-slate-50"
                onClick={() => toggle(tr.asm)}
              >
                <td className={nameBody + " text-slate-800"}>
                  <span className="mr-1 text-slate-400">
                    {expanded.has(tr.asm) ? "▼" : "▶"}
                  </span>
                  {tr.asm}{" "}
                  <span className="text-[9px] font-normal text-slate-400">
                    ({tr.paCount})
                  </span>
                </td>
                {tr.monthCells.map((c, i) => (
                  <td key={i} className={cellCls} style={attainStyle(c.pct)}>
                    {attainCell(c.pct, c.a, c.t)}
                  </td>
                ))}
                <td className={cellCls} style={attainStyle(tr.total.pct)}>
                  {attainCell(tr.total.pct, tr.total.a, tr.total.t)}
                </td>
              </tr>
              {expanded.has(tr.asm) &&
                computeAttainmentData(model, tr.pas, months).rows.map((r) => (
                  <tr key={tr.asm + "/" + r.name}>
                    <td
                      className={nameBody + " bg-slate-50"}
                      title={`${r.name} · ${storesForPa(model, r.name)}`}
                    >
                      <div className="pl-4 text-slate-700">{r.name}</div>
                      <div className="truncate pl-4 text-[9px] text-slate-400">
                        {storesForPa(model, r.name) || "—"}
                      </div>
                    </td>
                    {r.cells.map((c, i) => (
                      <td key={i} className={cellCls} style={attainStyle(c.pct)}>
                        {attainCell(c.pct, c.a, c.t)}
                      </td>
                    ))}
                    <td className={cellCls + " font-medium"} style={attainStyle(r.pctTot)}>
                      {attainCell(r.pctTot, r.aTot, r.tTot)}
                    </td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">
        Team attainment % per month (Actual ÷ Target). Tap a Team Leader to
        expand its PAs. Tap any column header to sort.
      </p>
    </div>
  );
}

// ---- main view ---------------------------------------------------------------

export function BiReportView() {
  const data = useDashboardData();
  const { model } = data;
  const [slicer, setSlicer] = useState<SlicerState>({
    years: [],
    months: [],
    asms: [],
    pas: [],
  });

  // Default the slicers to the latest year + month once data first loads.
  const [defaulted, setDefaulted] = useState(false);
  useEffect(() => {
    if (!model || defaulted || !model.dailyMonths.length) return;
    const latest = model.dailyMonths[model.dailyMonths.length - 1];
    setSlicer((s) => ({ ...s, years: [latest.slice(0, 4)], months: [latest] }));
    setDefaulted(true);
  }, [model, defaulted]);

  // Year and full-month-key lists for the slicers.
  const allMonths = useMemo<MonthKey[]>(() => {
    if (!model) return [];
    return Array.from(
      new Set([...model.dailyMonths, ...model.targetMonths])
    ).sort();
  }, [model]);
  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const m of allMonths) {
      const y = m.split("-")[0];
      if (y) ys.add(y);
    }
    return Array.from(ys).sort();
  }, [allMonths]);

  // A single month selected => day-level views; otherwise month-level.
  const specificMonth = slicer.months.length === 1 ? slicer.months[0] : null;
  // Resolve Year + Month (multi) into the concrete month scope (null = all).
  const monthScope = useMemo<MonthKey[] | null>(() => {
    if (slicer.months.length) return slicer.months;
    if (slicer.years.length)
      return allMonths.filter((m) => slicer.years.some((y) => m.startsWith(y + "-")));
    return null;
  }, [slicer.months, slicer.years, allMonths]);

  // PA/PATL scope, ignoring any month constraint (shared by panels).
  const scopeOnly: Filter = useMemo(
    () => ({ asms: slicer.asms, pas: slicer.pas }),
    [slicer.asms, slicer.pas]
  );

  const filter: Filter = useMemo(
    () => ({ ...scopeOnly, monthKeys: monthScope ?? undefined }),
    [scopeOnly, monthScope]
  );

  // Months used for Actual/Target/% rollups in the heatmap.
  const summaryMonths = useMemo<MonthKey[]>(
    () => monthScope ?? allMonths,
    [monthScope, allMonths]
  );

  // PAs in scope (for the Target-by-PA table), respecting the PATL/PA cascade.
  const scopePas = useMemo(() => {
    if (!model) return [];
    return model.pas.filter((p) => {
      if (slicer.pas.length) return slicer.pas.includes(p.name);
      if (slicer.asms.length) return slicer.asms.includes(p.asm);
      return true;
    });
  }, [model, slicer.pas, slicer.asms]);

  // PAs grouped by PATL (Team Leader) for the "% Attainment by PATL" section.
  const patlTeams = useMemo(() => {
    const map = new Map<string, { name: string; asm: string }[]>();
    for (const p of scopePas) {
      if (!map.has(p.asm)) map.set(p.asm, []);
      map.get(p.asm)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [scopePas]);

  // Target months to show as columns. Always show ALL target months (scoped by
  // Year only) so the attainment matrix shows the full year — the Month slicer
  // does NOT collapse it, mirroring the Monthly Lead vs Target chart.
  const targetTableMonths = useMemo<MonthKey[]>(() => {
    if (!model) return [];
    let ms = model.targetMonths;
    if (slicer.years.length)
      ms = ms.filter((m) => slicer.years.some((y) => m.startsWith(y + "-")));
    return ms;
  }, [model, slicer.years]);

  // PA options cascade from the selected PATLs (union; [] => every PA).
  const pasForAsmsFn = useMemo(() => {
    return (asms: string[]) => {
      if (!model) return [];
      const list = asms.length
        ? model.pas.filter((p) => asms.includes(p.asm))
        : model.pas;
      return list.map((p) => p.name);
    };
  }, [model]);

  const scopedDaily = useMemo(
    () => (model ? filteredDaily(model, filter) : []),
    [model, filter]
  );
  const scopedNU = useMemo(() => (model ? filteredNU(model, filter) : []), [model, filter]);

  // KPI scope attainment — only over months that have a real Tar.Lead.
  const scopeAttainment = useMemo(() => {
    if (!model) return null;
    const months = (monthScope ?? model.attainmentMonths).filter((m) =>
      model.attainmentMonths.includes(m)
    );
    let target = 0;
    let actual = 0;
    for (const m of months) {
      target += tarLeadForScopeMonth(model, filter, m);
      actual += sumTargetField(model, filter, m, "actLead");
    }
    return target > 0 ? (actual / target) * 100 : null;
  }, [model, filter, monthScope]);

  // Total actual leads (Act.Lead) in scope — for the KPI.
  const scopeActLead = useMemo(() => {
    if (!model) return 0;
    const months = monthScope ?? model.targetMonths;
    let s = 0;
    for (const m of months) s += sumTargetField(model, filter, m, "actLead");
    return s;
  }, [model, filter, monthScope]);

  // Monthly lead vs target (Target = Tar.Lead only). This chart stays "stagnant"
  // across every month — the Month slicer does NOT collapse it; only Year and
  // PATL/PA scope it. Always shows the full monthly trend for context.
  const leadVsTarget = useMemo(() => {
    if (!model) return [];
    const monthsToShow = slicer.years.length
      ? allMonths.filter((m) => slicer.years.some((y) => m.startsWith(y + "-")))
      : allMonths;
    return monthsToShow
      .map((m) => ({
        label: monthLabel(m).replace(" 20", " '"),
        // Both Target (Tar.Lead) and Actual (Act.Lead) come from the
        // "Target & Actual of Lead & NU" tab — apples to apples.
        Target: tarLeadForScopeMonth(model, scopeOnly, m),
        Actual: sumTargetField(model, scopeOnly, m, "actLead"),
      }))
      .filter((r) => r.Actual > 0 || r.Target > 0);
  }, [model, scopeOnly, slicer.years, allMonths]);

  // Monthly NU: Target (Tar.NU) vs Actual (Act.NU) from the Target & Actual tab.
  // Stagnant across months like the Lead chart; scoped by Year + PATL/PA only.
  const nuTargetVsActual = useMemo(() => {
    if (!model) return [];
    const monthsToShow = slicer.years.length
      ? allMonths.filter((m) => slicer.years.some((y) => m.startsWith(y + "-")))
      : allMonths;
    return monthsToShow
      .map((m) => ({
        label: monthLabel(m).replace(" 20", " '"),
        Target: sumTargetField(model, scopeOnly, m, "tarNU"),
        Actual: sumTargetField(model, scopeOnly, m, "actNU"),
      }))
      .filter((r) => r.Actual > 0 || r.Target > 0);
  }, [model, scopeOnly, slicer.years, allMonths]);

  // daily/monthly lead + NU trend
  const trend = useMemo(() => {
    if (!model) return [];
    const map = new Map<string, { label: string; Leads: number; NU: number; sort: string }>();
    const keyFor = (d: Date | null, month: string): { key: string; label: string; sort: string } | null => {
      if (specificMonth) {
        if (!d) return null;
        const day = d.getDate();
        return { key: `${month}-${day}`, label: String(day), sort: String(day).padStart(2, "0") };
      }
      return { key: month, label: monthLabel(month).replace(" 20", " '"), sort: month };
    };
    for (const d of scopedDaily) {
      const k = keyFor(d.createdAt, d.month);
      if (!k) continue;
      const e = map.get(k.key) || { label: k.label, Leads: 0, NU: 0, sort: k.sort };
      e.Leads++;
      map.set(k.key, e);
    }
    for (const r of scopedNU) {
      const k = keyFor(r.date, r.month);
      if (!k) continue;
      const e = map.get(k.key) || { label: k.label, Leads: 0, NU: 0, sort: k.sort };
      e.NU++;
      map.set(k.key, e);
    }
    return Array.from(map.values()).sort((a, b) => a.sort.localeCompare(b.sort));
  }, [model, scopedDaily, scopedNU, specificMonth]);

  const byProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of scopedDaily) {
      const p = d.product || "—";
      m.set(p, (m.get(p) || 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, leads]) => ({ name, leads }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 12);
  }, [scopedDaily]);

  const byCustomer = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of scopedDaily) {
      const c = d.outlet || "—";
      m.set(c, (m.get(c) || 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, leads]) => ({ name, leads }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 15);
  }, [scopedDaily]);

  if (!model) return <LoadingState />;

  return (
    <div>
      {/* DKSH-style header band */}
      <div className="-mx-4 mb-3 bg-gradient-to-r from-brand-700 to-brand-500 px-4 py-3 text-white">
        <div className="text-xs font-medium uppercase tracking-widest text-brand-100">
          Lead Performance
        </div>
        <div className="text-lg font-bold leading-tight">
          Product Ambassador — Lead Performance
        </div>
        <div className="text-[11px] text-brand-100">
          Abbott Nutrition · Similac · Ensure · Glucerna · Pediasure
        </div>
      </div>

      <DataStatus data={data} />

      {(model.target.rows.length === 0 ||
        (model.target.debug?.tarLeadCols ?? 0) === 0) && (
        <div className="mb-3 rounded-lg border-2 border-status-red bg-red-50 p-2">
          <div className="text-xs font-semibold text-status-red">
            ⚠ Target Lead not detected — screenshot the box below and send it.
          </div>
          <Diagnostics model={model} open />
        </div>
      )}

      <CascadingSlicers
        state={slicer}
        onChange={setSlicer}
        years={years}
        months={allMonths}
        asms={model.asms}
        pasForAsms={pasForAsmsFn}
      />

      {/* KPI strip */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <KpiTile label="Leads (Act.Lead)" value={fmtInt(scopeActLead)} />
        <KpiTile
          label="Attainment"
          value={scopeAttainment == null ? "n/a" : fmtPct(scopeAttainment)}
          sub="vs Tar.Lead"
        />
        <KpiTile
          label="PAs"
          value={fmtInt(
            slicer.pas.length
              ? slicer.pas.length
              : pasForAsmsFn(slicer.asms).length
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel
          title="Monthly Lead vs Target"
          hint="from Target & Actual tab (Tar.Lead vs Act.Lead)"
          exportName="lead-vs-target"
          exportRows={() =>
            leadVsTarget.map((r) => ({
              Month: r.label,
              "Target Lead": r.Target,
              "Actual Lead": r.Actual,
            }))
          }
        >
          <GroupedBarChart
            data={leadVsTarget}
            xKey="label"
            series={[
              { key: "Target", name: "Target Lead", color: "#93c5fd" },
              { key: "Actual", name: "Actual Lead", color: "#1d4ed8" },
            ]}
          />
          {leadVsTarget.length > 0 &&
            leadVsTarget.every((r) => r.Target === 0) && (
              <p className="mt-1 text-[11px] text-status-red">
                No Target Lead values detected ({model.target.rows.length} target
                rows parsed). Make sure the &ldquo;Target &amp; Actual of Lead &amp;
                NU&rdquo; tab is published as CSV and has a Tar.Lead column.
              </p>
            )}
        </Panel>

        <Panel
          title="Lead & NU Trend"
          hint={specificMonth ? "by day" : "by month"}
          exportName="lead-nu-trend"
          exportRows={() =>
            trend.map((r) => ({ Period: r.label, Leads: r.Leads, "New Users": r.NU }))
          }
        >
          <DailyTrendChart
            data={trend}
            xKey="label"
            barKey="Leads"
            lineKey="NU"
            barName="Leads"
            lineName="New Users"
          />
        </Panel>
      </div>

      <Panel
        title="Monthly NU: Target vs Actual"
        hint="all months · Tar.NU vs Act.NU"
        className="mt-3"
        exportName="nu-target-vs-actual"
        exportRows={() =>
          nuTargetVsActual.map((r) => ({
            Month: r.label,
            "Target NU": r.Target,
            "Actual NU": r.Actual,
          }))
        }
      >
        <GroupedBarChart
          data={nuTargetVsActual}
          xKey="label"
          series={[
            { key: "Target", name: "Target NU", color: "#99f6e4" },
            { key: "Actual", name: "Actual NU", color: "#0d9488" },
          ]}
        />
      </Panel>

      <Panel
        title="Attainment % by PA"
        hint="all months · green = achieved · red = below"
        className="mt-3"
        exportName="attainment-by-pa"
        exportRows={() => attainmentExport(model, scopePas, targetTableMonths)}
      >
        <AttainmentHeatmap model={model} pas={scopePas} months={targetTableMonths} />
      </Panel>

      <Panel
        title="% Attainment by PATL"
        hint="monthly · tap a team leader to expand its PAs · sortable"
        className="mt-3"
        exportName="attainment-by-patl"
        exportRows={() =>
          patlTeams.map(([asm, teamPas]) => {
            const out: Record<string, unknown> = {
              "Team Leader": asm,
              PAs: teamPas.length,
            };
            targetTableMonths.forEach((m) => {
              const p = combinedAttainment(model, teamPas, [m]);
              out[`${monthLabel(m)} %`] = p == null ? "" : Math.round(p);
            });
            const tot = combinedAttainment(model, teamPas, targetTableMonths);
            out["Total %"] = tot == null ? "" : Math.round(tot);
            return out;
          })
        }
      >
        <AttainmentByPatl model={model} teams={patlTeams} months={targetTableMonths} />
      </Panel>

      <Panel
        title="PA × Day Heatmap"
        hint="green/red vs daily target of 3 · top 30 PAs"
        className="mt-3"
        exportName="pa-by-day"
        exportRows={() => heatmapExport(model, filter, summaryMonths)}
      >
        <HeatMap model={model} filter={filter} summaryMonths={summaryMonths} />
      </Panel>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel
          title="Leads by Product"
          hint="from daily Product column"
          exportName="leads-by-product"
          exportRows={() => byProduct.map((r) => ({ Product: r.name, Leads: r.leads }))}
        >
          <HorizontalLabeledBar
            data={byProduct}
            dataKey="leads"
            yKey="name"
            height={Math.max(160, byProduct.length * 26)}
            valueFormatter={(v) => fmtInt(v)}
          />
        </Panel>

        <Panel
          title="Leads by Customer"
          hint="top 15 outlets (Full Name)"
          exportName="leads-by-customer"
          exportRows={() => byCustomer.map((r) => ({ Customer: r.name, Leads: r.leads }))}
        >
          <HorizontalLabeledBar
            data={byCustomer}
            dataKey="leads"
            yKey="name"
            height={Math.max(160, byCustomer.length * 24)}
            valueFormatter={(v) => fmtInt(v)}
          />
        </Panel>
      </div>

      <p className="mt-4 text-[11px] text-slate-400">
        Showing only PAs under a Team Leader (PATL) — unclassified PAs, their
        leads, and unmatched NU are excluded. NU joins to PAs via Contact ID
        (~{fmtPct(model.nuMatchRate * 100)} of NU matched to a PATL&rsquo;s PA).
      </p>

      <Diagnostics model={model} />
    </div>
  );
}

/** Collapsible parse diagnostics — helps pinpoint data/publish issues. */
function Diagnostics({ model, open = false }: { model: DashboardModel; open?: boolean }) {
  const d = model.target.debug;
  const line = "flex justify-between gap-3 border-b border-slate-100 py-0.5";
  return (
    <details
      open={open}
      className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600"
    >
      <summary className="cursor-pointer font-semibold text-slate-700">
        Diagnostics (parse health)
      </summary>
      <div className="mt-2 space-y-0.5">
        <div className={line}>
          <span>Daily lead rows</span>
          <span className="tabular-nums">{model.daily.length}</span>
        </div>
        <div className={line}>
          <span>Target rows</span>
          <span className="tabular-nums">{model.target.rows.length}</span>
        </div>
        <div className={line}>
          <span>NU rows</span>
          <span className="tabular-nums">{model.nu.length}</span>
        </div>
        <div className={line}>
          <span>Training rows</span>
          <span className="tabular-nums">{model.training.length}</span>
        </div>
        <div className={line}>
          <span>Target months detected</span>
          <span className="text-right">
            {model.targetMonths.join(", ") || "(none)"}
          </span>
        </div>
        <div className={line}>
          <span>Attainment months</span>
          <span className="text-right">
            {model.attainmentMonths.join(", ") || "(none)"}
          </span>
        </div>
        {d && (
          <>
            <div className={line}>
              <span>CSV rows / month-row idx / month-start col</span>
              <span className="tabular-nums">
                {d.totalCsvRows} / {d.monthRowIdx} / {d.monthStart}
              </span>
            </div>
            <div className={line}>
              <span>Header rows / data starts at row</span>
              <span className="tabular-nums">
                {d.headerRowCount} / {d.dataStartRow}
              </span>
            </div>
            <div className={line}>
              <span>Mapped cols / of which Tar.Lead</span>
              <span className="tabular-nums">
                {d.mappedCols} / {d.tarLeadCols}
              </span>
            </div>
            <div className="pt-1">
              <div className="font-medium text-slate-500">
                Combined header per month-column:
              </div>
              <div className="break-all font-mono text-[10px]">
                [{d.combinedHeaderSample.map((c) => `"${c}"`).join(", ")}]
              </div>
            </div>
            <div className="pt-1">
              <div className="font-medium text-slate-500">Detected month row:</div>
              <div className="break-all font-mono text-[10px]">
                [{d.headerMonthsSample.map((c) => `"${c}"`).join(", ")}]
              </div>
            </div>
            <div className="pt-1">
              <div className="font-medium text-slate-500">Detected sub-header row:</div>
              <div className="break-all font-mono text-[10px]">
                [{d.headerSubsSample.map((c) => `"${c}"`).join(", ")}]
              </div>
            </div>
            <div className="pt-1">
              <div className="font-medium text-slate-500">First data row:</div>
              <div className="break-all font-mono text-[10px]">
                [{d.sampleDataRow.map((c) => `"${c}"`).join(", ")}]
              </div>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
