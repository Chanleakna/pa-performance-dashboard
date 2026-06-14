"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "../lib/useData";
import {
  actLeadForPaMonth,
  filteredNU,
  sumTargetField,
  tarLeadForScopeMonth,
  targetFieldForPa,
  targetLeadForPaMonth,
  type DashboardModel,
} from "../lib/model";
import { type MonthKey, monthLabel, normName } from "../lib/parse";
import { fmtInt, fmtPct } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import { DataStatus, LoadingState } from "../components/DataStatus";
import { CascadingSlicers, type SlicerState } from "../components/Slicers";
import { GroupedBarChart, LabeledBarChart } from "../components/charts";
import { AttainmentPill } from "../components/ui";

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

interface Row {
  name: string;
  asm: string;
  leadAct: number;
  leadTar: number;
  leadPct: number | null;
  nuAct: number;
  nuTar: number;
  nuPct: number | null;
  strike: number | null; // recruited NU ÷ Act.Lead
  knowledge: number | null;
}

type SortKey =
  | "name"
  | "leadAct"
  | "leadPct"
  | "nuAct"
  | "nuPct"
  | "strike"
  | "knowledge";
const nv = (v: number | null) => (v == null ? -1 : v);

export function SummaryView() {
  const data = useDashboardData();
  const { model } = data;
  const [slicer, setSlicer] = useState<SlicerState>({ years: [], months: [], asms: [], pas: [] });
  const [defaulted, setDefaulted] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("leadAct");
  const [asc, setAsc] = useState(false);

  const allMonths = useMemo<MonthKey[]>(() => {
    if (!model) return [];
    return Array.from(new Set([...model.dailyMonths, ...model.targetMonths])).sort();
  }, [model]);
  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const m of allMonths) ys.add(m.slice(0, 4));
    return Array.from(ys).sort();
  }, [allMonths]);

  useEffect(() => {
    if (!model || defaulted || !years.length) return;
    setSlicer((s) => ({ ...s, years: [years[years.length - 1]] }));
    setDefaulted(true);
  }, [model, defaulted, years]);

  const pasForAsmsFn = useMemo(() => {
    return (asms: string[]) => {
      if (!model) return [];
      const list = asms.length ? model.pas.filter((p) => asms.includes(p.asm)) : model.pas;
      return list.map((p) => p.name);
    };
  }, [model]);

  const scopeOnly = useMemo(
    () => ({ asms: slicer.asms, pas: slicer.pas }),
    [slicer.asms, slicer.pas]
  );
  // Charts show every month of the selected year (trend); the table respects
  // the Month slicer too.
  const months = useMemo(
    () =>
      slicer.years.length
        ? allMonths.filter((m) => slicer.years.some((y) => m.startsWith(y + "-")))
        : allMonths,
    [allMonths, slicer.years]
  );
  const tableMonths = useMemo(
    () => (slicer.months.length ? slicer.months : months),
    [slicer.months, months]
  );

  const leadVsTarget = useMemo(() => {
    if (!model) return [];
    return months
      .map((m) => ({
        label: monthLabel(m).replace(" 20", " '"),
        Target: tarLeadForScopeMonth(model, scopeOnly, m),
        Actual: sumTargetField(model, scopeOnly, m, "actLead"),
      }))
      .filter((r) => r.Actual > 0 || r.Target > 0);
  }, [model, scopeOnly, months]);

  const nuVsTarget = useMemo(() => {
    if (!model) return [];
    return months
      .map((m) => ({
        label: monthLabel(m).replace(" 20", " '"),
        Target: sumTargetField(model, scopeOnly, m, "tarNU"),
        Actual: sumTargetField(model, scopeOnly, m, "actNU"),
      }))
      .filter((r) => r.Actual > 0 || r.Target > 0);
  }, [model, scopeOnly, months]);

  const strikeTrend = useMemo(() => {
    if (!model) return [];
    const nuByMonth = new Map<string, number>();
    for (const r of filteredNU(model, scopeOnly)) nuByMonth.set(r.month, (nuByMonth.get(r.month) || 0) + 1);
    return months
      .map((m) => {
        const lead = sumTargetField(model, scopeOnly, m, "actLead");
        const nu = nuByMonth.get(m) || 0;
        return { label: monthLabel(m).replace(" 20", " '"), pct: lead > 0 ? Math.round((nu / lead) * 100) : 0, nu, lead };
      })
      .filter((r) => r.nu > 0 || r.lead > 0);
  }, [model, scopeOnly, months]);

  const rows = useMemo<Row[]>(() => {
    if (!model) return [];
    const scopePas = model.pas.filter((p) => {
      if (slicer.pas.length) return slicer.pas.includes(p.name);
      if (slicer.asms.length) return slicer.asms.includes(p.asm);
      return true;
    });
    // training avg per name over the table months
    const train = new Map<string, { sum: number; n: number }>();
    for (const t of model.training) {
      if (!t.name || t.pctAchieve == null || !tableMonths.includes(t.month)) continue;
      const k = normName(t.name);
      const c = train.get(k) || { sum: 0, n: 0 };
      c.sum += t.pctAchieve;
      c.n += 1;
      train.set(k, c);
    }
    return scopePas.map((p) => {
      const leadAct = tableMonths.reduce((s, m) => s + actLeadForPaMonth(model, p.name, m), 0);
      const leadTar = tableMonths.reduce((s, m) => s + targetLeadForPaMonth(model, p.name, m), 0);
      const nuAct = targetFieldForPa(model, p.name, "actNU", tableMonths);
      const nuTar = targetFieldForPa(model, p.name, "tarNU", tableMonths);
      const recruited = (model.nuByPa[p.name] || []).filter((r) => tableMonths.includes(r.month)).length;
      const tk = train.get(normName(p.name));
      return {
        name: p.name,
        asm: p.asm,
        leadAct,
        leadTar,
        leadPct: leadTar > 0 ? (leadAct / leadTar) * 100 : null,
        nuAct,
        nuTar,
        nuPct: nuTar > 0 ? (nuAct / nuTar) * 100 : null,
        strike: leadAct > 0 ? (recruited / leadAct) * 100 : null,
        knowledge: tk && tk.n ? tk.sum / tk.n : null,
      };
    });
  }, [model, tableMonths, slicer.pas, slicer.asms]);

  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      return (nv(a[sortKey] as number | null) - nv(b[sortKey] as number | null)) * dir;
    });
  }, [rows, sortKey, asc]);

  if (!model) return <LoadingState />;

  const setSort = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "name");
    }
  };
  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      onClick={() => setSort(k)}
      className="sticky top-0 z-20 cursor-pointer select-none whitespace-nowrap bg-white px-2 py-2 text-right font-medium text-slate-500 hover:text-brand-700"
    >
      {label}
      {sortKey === k && <span className="ml-0.5 text-brand-600">{asc ? "▲" : "▼"}</span>}
    </th>
  );

  return (
    <div>
      <DataStatus data={data} />
      <CascadingSlicers
        state={slicer}
        onChange={setSlicer}
        years={years}
        months={allMonths}
        asms={model.asms}
        pasForAsms={pasForAsmsFn}
      />

      <Panel title="Lead vs Target by month" hint="Tar.Lead vs Act.Lead">
        <GroupedBarChart
          data={leadVsTarget}
          xKey="label"
          series={[
            { key: "Target", name: "Target Lead", color: "#93c5fd" },
            { key: "Actual", name: "Actual Lead", color: "#1d4ed8" },
          ]}
        />
      </Panel>

      <Panel title="NU vs Target by month" hint="Tar.NU vs Act.NU">
        <GroupedBarChart
          data={nuVsTarget}
          xKey="label"
          series={[
            { key: "Target", name: "Target NU", color: "#99f6e4" },
            { key: "Actual", name: "Actual NU", color: "#0d9488" },
          ]}
        />
      </Panel>

      <Panel title="Strike rate by month" hint="New Users ÷ Act.Lead">
        <LabeledBarChart
          data={strikeTrend}
          dataKey="pct"
          xKey="label"
          color="#6366f1"
          valueFormatter={(v) => `${v}%`}
        />
      </Panel>

      <div className="mt-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Top performers by PA</h2>
          <button
            onClick={() =>
              downloadCsv(
                "overview-top-performers",
                sorted.map((r, i) => ({
                  Rank: i + 1,
                  PA: r.name,
                  "Team Leader": r.asm,
                  "Lead Act": r.leadAct,
                  "Lead Tar": r.leadTar,
                  "Lead %": r.leadPct == null ? "" : Math.round(r.leadPct),
                  "NU Act": r.nuAct,
                  "NU Tar": r.nuTar,
                  "NU %": r.nuPct == null ? "" : Math.round(r.nuPct),
                  "Strike %": r.strike == null ? "" : Math.round(r.strike),
                  "Knowledge %": r.knowledge == null ? "" : Math.round(r.knowledge),
                }))
              )
            }
            className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 hover:bg-brand-50"
          >
            ⬇ CSV
          </button>
        </div>
        <div className="no-scrollbar max-h-[70vh] overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="sticky top-0 z-20 bg-white px-2 py-2 text-left font-medium text-slate-500">#</th>
                <th
                  onClick={() => setSort("name")}
                  className="sticky top-0 z-20 cursor-pointer select-none bg-white px-2 py-2 text-left font-medium text-slate-500 hover:text-brand-700"
                >
                  PA{sortKey === "name" && <span className="ml-0.5 text-brand-600">{asc ? "▲" : "▼"}</span>}
                </th>
                <Th k="leadAct" label="Lead Act" />
                <th className="sticky top-0 z-20 bg-white px-2 py-2 text-right font-medium text-slate-500">Lead Tar</th>
                <Th k="leadPct" label="Lead %" />
                <Th k="nuAct" label="NU Act" />
                <th className="sticky top-0 z-20 bg-white px-2 py-2 text-right font-medium text-slate-500">NU Tar</th>
                <Th k="nuPct" label="NU %" />
                <Th k="strike" label="Strike %" />
                <Th k="knowledge" label="Know %" />
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 150).map((r, i) => (
                <tr key={r.name} className="border-b border-slate-50 last:border-0">
                  <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-[9px] text-slate-400">{r.asm}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtInt(r.leadAct)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{fmtInt(r.leadTar)}</td>
                  <td className="px-2 py-1.5 text-right"><AttainmentPill pct={r.leadPct} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.nuAct)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{fmtInt(r.nuTar)}</td>
                  <td className="px-2 py-1.5 text-right"><AttainmentPill pct={r.nuPct} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-indigo-700">
                    {r.strike == null ? "—" : `${Math.round(r.strike)}%`}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-teal-700">
                    {r.knowledge == null ? "—" : `${Math.round(r.knowledge)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Lead/NU use Act vs Tar (Target & Actual tab). Strike % = recruited New
          Users ÷ Act.Lead. Know % = avg training % Achieve. Ranked by Lead Act —
          tap any header to re-sort.
        </p>
      </div>
    </div>
  );
}
