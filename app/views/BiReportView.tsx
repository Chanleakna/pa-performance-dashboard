"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../lib/useData";
import {
  asmForPa,
  filteredDaily,
  filteredNU,
  summarizeNU,
  tarLeadForPaMonth,
  tarLeadForScopeMonth,
  type DashboardModel,
  type Filter,
} from "../lib/model";
import { monthLabel, type MonthKey } from "../lib/parse";
import { BRANDS } from "../lib/config";
import { fmtInt, fmtPct } from "../lib/format";
import { DataStatus, LoadingState } from "../components/DataStatus";
import { AttainmentPill } from "../components/ui";
import { CascadingSlicers, type SlicerState } from "../components/Slicers";
import {
  GroupedBarChart,
  HorizontalLabeledBar,
  LabeledBarChart,
  DailyTrendChart,
} from "../components/charts";

// ---- small presentational helpers -------------------------------------------

function Panel({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100 " + className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** A clearly-marked placeholder for data that does NOT exist in these sheets. */
function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center">
      <h3 className="text-sm font-semibold text-slate-500">{title}</h3>
      <p className="mt-1 text-[11px] text-slate-400">
        No IMS / Act.Sales data in the source sheets — placeholder.
      </p>
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
  const { cols, rows } = useMemo(() => {
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

    const rows = Array.from(byPa.entries())
      .map(([pa, m]) => {
        const actual = Array.from(m.values()).reduce((a, b) => a + b, 0);
        // Target = sum of Tar.Lead over the scope months (only Tar.Lead, per spec).
        let target = 0;
        for (const mk of summaryMonths) target += tarLeadForPaMonth(model, pa, mk);
        const pct = target > 0 ? (actual / target) * 100 : null;
        return { pa, m, actual, target, pct };
      })
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 30);

    return { cols, rows };
  }, [model, filter, summaryMonths]);

  const max = useMemo(
    () => rows.reduce((mx, r) => Math.max(mx, ...Array.from(r.m.values())), 1),
    [rows]
  );

  if (rows.length === 0)
    return <p className="py-6 text-center text-xs text-slate-400">No leads in scope.</p>;

  return (
    <div className="no-scrollbar overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[10px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white pr-2 text-left font-medium text-slate-400">
              PA
            </th>
            {cols.map((c) => (
              <th key={c.key} className="px-0.5 font-medium text-slate-400">
                {c.label}
              </th>
            ))}
            <th className="px-1 text-right font-semibold text-slate-500">Act</th>
            <th className="px-1 text-right font-semibold text-slate-500">Tar</th>
            <th className="px-1 text-right font-semibold text-slate-500">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pa}>
              <td className="sticky left-0 z-10 max-w-[110px] truncate bg-white pr-2 text-slate-600">
                {r.pa}
              </td>
              {cols.map((c) => {
                const v = r.m.get(c.key) || 0;
                const intensity = v === 0 ? 0 : 0.15 + 0.85 * (v / max);
                return (
                  <td
                    key={c.key}
                    title={`${r.pa} · ${c.label}: ${v}`}
                    className="h-5 w-5 min-w-[20px] rounded text-center text-[9px] text-white"
                    style={{
                      backgroundColor: v === 0 ? "#f1f5f9" : `rgba(37, 99, 235, ${intensity})`,
                      color: intensity > 0.5 ? "#fff" : "#1e3a8a",
                    }}
                  >
                    {v || ""}
                  </td>
                );
              })}
              <td className="px-1 text-right font-semibold tabular-nums text-slate-700">
                {fmtInt(r.actual)}
              </td>
              <td className="px-1 text-right tabular-nums text-slate-500">
                {r.target > 0 ? fmtInt(r.target) : "—"}
              </td>
              <td className="px-1 text-right">
                <AttainmentPill pct={r.pct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">
        Columns = day of month (1, 2, 3 …). Cells = daily lead count. Act / Tar /
        % roll up over the selected scope using only{" "}
        <span className="font-medium">Tar.Lead</span> (apple-to-apple). Months
        without a Tar.Lead (e.g. March) show no %.
      </p>
    </div>
  );
}

// ---- Target Lead by PA (PA rows × month columns + a Total row) ---------------

function TargetByPaTable({
  model,
  pas,
  months,
}: {
  model: DashboardModel;
  pas: { name: string; asm: string }[];
  months: MonthKey[];
}) {
  const { rows, colTotals, grand } = useMemo(() => {
    const rows = pas
      .map((p) => {
        const vals = months.map((m) => tarLeadForPaMonth(model, p.name, m));
        const total = vals.reduce((a, b) => a + b, 0);
        return { name: p.name, asm: p.asm, vals, total };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 150);

    const colTotals = months.map((_, i) =>
      rows.reduce((a, r) => a + r.vals[i], 0)
    );
    const grand = colTotals.reduce((a, b) => a + b, 0);
    return { rows, colTotals, grand };
  }, [model, pas, months]);

  if (months.length === 0)
    return (
      <p className="py-6 text-center text-xs text-slate-400">
        No target months in scope.
      </p>
    );

  const cell = "whitespace-nowrap px-1.5 py-1 text-right tabular-nums";
  const nameCell =
    "sticky left-0 z-10 max-w-[120px] truncate bg-white px-1.5 py-1 text-left";

  return (
    <div className="no-scrollbar overflow-x-auto">
      <table className="text-[11px]">
        <thead>
          <tr className="border-b border-slate-200 text-slate-400">
            <th className={nameCell + " font-medium"}>PA</th>
            {months.map((m) => (
              <th key={m} className={cell + " font-medium"}>
                {monthLabel(m).split(" ")[0]}
              </th>
            ))}
            <th className={cell + " font-semibold text-slate-500"}>Total</th>
          </tr>
        </thead>
        <tbody>
          {/* Accumulated total of all PAs together. */}
          <tr className="border-b border-slate-200 bg-brand-50 font-semibold text-brand-800">
            <td className={nameCell + " bg-brand-50"}>Total (all PAs)</td>
            {colTotals.map((t, i) => (
              <td key={i} className={cell}>
                {fmtInt(t)}
              </td>
            ))}
            <td className={cell}>{fmtInt(grand)}</td>
          </tr>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-slate-50 last:border-0">
              <td className={nameCell + " text-slate-700"} title={`${r.name} · ${r.asm}`}>
                {r.name}
              </td>
              {r.vals.map((v, i) => (
                <td key={i} className={cell + " text-slate-600"}>
                  {v > 0 ? fmtInt(v) : "—"}
                </td>
              ))}
              <td className={cell + " font-medium text-slate-800"}>{fmtInt(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">
        Values are <span className="font-medium">Target Lead</span> (Tar.Lead) per
        PA per month. The top row accumulates all PAs in scope.
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

  // Target months to show as columns (target tab months, scoped by Year/Month).
  const targetTableMonths = useMemo<MonthKey[]>(() => {
    if (!model) return [];
    let ms = model.targetMonths;
    if (slicer.months.length) ms = ms.filter((m) => slicer.months.includes(m));
    else if (slicer.years.length)
      ms = ms.filter((m) => slicer.years.some((y) => m.startsWith(y + "-")));
    return ms;
  }, [model, slicer.months, slicer.years]);

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
      actual += filteredDaily(model, { ...filter, monthKeys: [m] }).length;
    }
    return target > 0 ? (actual / target) * 100 : null;
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
        label: monthLabel(m).split(" ")[0],
        Target: tarLeadForScopeMonth(model, scopeOnly, m),
        Actual: filteredDaily(model, { ...scopeOnly, monthKeys: [m] }).length,
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
      return { key: month, label: monthLabel(month).split(" ")[0], sort: month };
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

  // by Team Leader
  const byTeamLeader = useMemo(() => {
    if (!model) return [];
    const leadByAsm = new Map<string, number>();
    for (const d of scopedDaily) {
      const asm = asmForPa(model, d.paName);
      leadByAsm.set(asm, (leadByAsm.get(asm) || 0) + 1);
    }
    const nuByAsm = new Map<string, number>();
    for (const r of scopedNU) {
      // Re-derive the team leader from the Contact-ID name (filteredNU is flat).
      const asm = asmForPa(model, r.contactId);
      nuByAsm.set(asm, (nuByAsm.get(asm) || 0) + 1);
    }
    const keys = new Set<string>([...leadByAsm.keys(), ...nuByAsm.keys()]);
    return Array.from(keys)
      .map((asm) => ({ asm, Leads: leadByAsm.get(asm) || 0, NU: nuByAsm.get(asm) || 0 }))
      .sort((a, b) => b.Leads - a.Leads);
  }, [model, scopedDaily, scopedNU]);

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

  const nuSummary = useMemo(() => summarizeNU(scopedNU), [scopedNU]);

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
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiTile label="Leads" value={fmtInt(scopedDaily.length)} />
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
        <PlaceholderPanel title="Total IMS" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Monthly Lead vs Target" hint="all months · Tar.Lead only">
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
        title="Target Lead by PA"
        hint="Tar.Lead · PA × month + Total"
        className="mt-3"
      >
        <TargetByPaTable model={model} pas={scopePas} months={targetTableMonths} />
      </Panel>

      <Panel
        title="PA × Day Heatmap"
        hint="by day · leads + Actual/Target/% · top 30 PAs"
        className="mt-3"
      >
        <HeatMap model={model} filter={filter} summaryMonths={summaryMonths} />
      </Panel>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Lead & NU by Team Leader">
          <GroupedBarChart
            data={byTeamLeader}
            xKey="asm"
            series={[
              { key: "Leads", name: "Leads", color: "#2563eb" },
              { key: "NU", name: "New Users", color: "#14b8a6" },
            ]}
          />
        </Panel>

        <Panel title="New Users by Brand">
          <LabeledBarChart
            data={BRANDS.map((b) => ({ brand: b, nu: nuSummary.byBrand[b] || 0 }))}
            dataKey="nu"
            xKey="brand"
            color="#0ea5e9"
            valueFormatter={(v) => fmtInt(v)}
          />
        </Panel>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Leads by Product" hint="from daily Product column">
          <HorizontalLabeledBar
            data={byProduct}
            dataKey="leads"
            yKey="name"
            height={Math.max(160, byProduct.length * 26)}
            valueFormatter={(v) => fmtInt(v)}
          />
        </Panel>

        <Panel title="Leads by Customer" hint="top 15 outlets (Full Name)">
          <HorizontalLabeledBar
            data={byCustomer}
            dataKey="leads"
            yKey="name"
            height={Math.max(160, byCustomer.length * 24)}
            valueFormatter={(v) => fmtInt(v)}
          />
        </Panel>
      </div>

      {/* IMS / Act.Sales placeholders — these metrics do NOT exist in source */}
      <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-500">
        IMS / Act.Sales (not in source data)
      </h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <PlaceholderPanel title="Act.Sales / Lead" />
        <PlaceholderPanel title="Act.Sales / PA" />
        <PlaceholderPanel title="IMS by Product" />
        <PlaceholderPanel title="IMS / Lead" />
        <PlaceholderPanel title="IMS by Customer" />
        <PlaceholderPanel title="Total IMS" />
      </div>

      <p className="mt-4 text-[11px] text-slate-400">
        Attainment uses target months only (Jan/Feb/Apr 2026); March shows in
        lead views but has no Tar.Lead. NU joins to PAs via Contact ID
        (~{fmtPct(model.nuMatchRate * 100)} matched; the rest are Unassigned).
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
