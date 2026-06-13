"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../lib/useData";
import {
  buildASMRollups,
  buildPASummaries,
  overallAttainment,
  salesForAsm,
  salesForPa,
} from "../lib/model";
import { fmtInt, fmtPct, fmtCompact } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import { DataStatus, LoadingState } from "../components/DataStatus";
import { AttainmentPill, StatCard } from "../components/ui";
import { HorizontalLabeledBar } from "../components/charts";
import { useDebounced } from "../lib/hooks";

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
    >
      ⬇ CSV
    </button>
  );
}

function PanelHead({
  title,
  hint,
  exportRows,
  exportName,
}: {
  title: string;
  hint?: string;
  exportRows?: () => Record<string, unknown>[];
  exportName?: string;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <div className="flex shrink-0 items-center gap-2">
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
        {exportRows && <ExportButton rows={exportRows} name={exportName || title} />}
      </div>
    </div>
  );
}

type PaSort = "sales" | "leads" | "nuTotal" | "attainment" | "name";

export function OverviewView() {
  const data = useDashboardData();
  const { model } = data;
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<PaSort>("sales");
  const [asc, setAsc] = useState(false);
  const q = useDebounced(query, 250).toLowerCase();

  const asmRows = useMemo(() => {
    if (!model) return [];
    return buildASMRollups(model)
      .map((r) => ({ ...r, sales: salesForAsm(model, r.asm) }))
      .sort((a, b) => b.sales - a.sales);
  }, [model]);

  const paRows = useMemo(() => {
    if (!model) return [];
    return buildPASummaries(model).map((s) => ({
      ...s,
      sales: salesForPa(model, s.name),
    }));
  }, [model]);

  const sortedPas = useMemo(() => {
    const filtered = paRows.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.asm.toLowerCase().includes(q)
    );
    const dir = asc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      const av = (a[sortKey] as number | null) ?? -1;
      const bv = (b[sortKey] as number | null) ?? -1;
      return (av - bv) * dir;
    });
  }, [paRows, q, sortKey, asc]);

  if (!model) return <LoadingState />;

  const overall = overallAttainment(model, model.attainmentMonths);
  const salesChart = asmRows.map((r) => ({ asm: r.asm, sales: r.sales }));

  const setSort = (k: PaSort) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "name");
    }
  };
  const Th = ({ k, label, right }: { k: PaSort; label: string; right?: boolean }) => (
    <th
      onClick={() => setSort(k)}
      className={
        "cursor-pointer select-none whitespace-nowrap px-2 py-2 font-medium text-slate-500 hover:text-slate-800 " +
        (right ? "text-right" : "text-left")
      }
    >
      {label}
      {sortKey === k && <span className="ml-0.5 text-brand-600">{asc ? "▲" : "▼"}</span>}
    </th>
  );

  return (
    <div>
      <DataStatus data={data} />

      {/* KPI strip */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="Actual Sales"
          value={fmtCompact(model.salesTotal)}
          sub="from Daily Sales"
          accent="teal"
        />
        <StatCard label="Total Leads" value={fmtInt(model.daily.length)} />
        <StatCard label="New Users" value={fmtInt(model.nu.length)} accent="indigo" />
        <StatCard
          label="Attainment"
          value={overall == null ? "n/a" : fmtPct(overall)}
          sub="target months"
          accent="slate"
        />
      </div>

      {model.salesTotal === 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          No actual sales matched yet. Check that the Daily Sales{" "}
          <span className="font-medium">export</span> tab is published as CSV and
          that the correct tab gid is set — see the Sales diagnostics below.
        </div>
      )}

      {/* Actual Sales by Team Leader */}
      <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <PanelHead
          title="Actual Sales by Team Leader"
          hint="joined Code → Customer Code"
          exportName="sales-by-patl"
          exportRows={() =>
            asmRows.map((r) => ({
              "Team Leader": r.asm,
              "Actual Sales": Math.round(r.sales),
              Leads: r.leads,
              "New Users": r.nuTotal,
              "Attainment %": r.attainment == null ? "" : Math.round(r.attainment),
            }))
          }
        />
        <HorizontalLabeledBar
          data={salesChart}
          dataKey="sales"
          yKey="asm"
          color="#0d9488"
          height={Math.max(160, salesChart.length * 44)}
          valueFormatter={(v) => fmtCompact(v)}
        />
      </div>

      {/* Team Leader rollup table */}
      <div className="mt-3 overflow-x-auto rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <PanelHead title="Team Leader summary" />
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-xs">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-slate-500">Team Leader</th>
              <th className="px-2 py-2 text-right font-medium text-slate-500">PAs</th>
              <th className="px-2 py-2 text-right font-medium text-slate-500">Leads</th>
              <th className="px-2 py-2 text-right font-medium text-slate-500">NU</th>
              <th className="px-2 py-2 text-right font-medium text-slate-500">Attain.</th>
              <th className="px-2 py-2 text-right font-medium text-slate-500">Actual Sales</th>
            </tr>
          </thead>
          <tbody>
            {asmRows.map((r) => (
              <tr key={r.asm} className="border-b border-slate-50 last:border-0">
                <td className="px-2 py-2 font-medium text-slate-800">{r.asm}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500">{r.paCount}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtInt(r.leads)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtInt(r.nuTotal)}</td>
                <td className="px-2 py-2 text-right"><AttainmentPill pct={r.attainment} /></td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-teal-700">
                  {fmtInt(r.sales)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-PA combined table */}
      <div className="mt-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <PanelHead
          title="By PA — performance & sales"
          exportName="overview-by-pa"
          exportRows={() =>
            sortedPas.map((p) => ({
              PA: p.name,
              "Team Leader": p.asm,
              Leads: p.leads,
              "New Users": p.nuTotal,
              "Attainment %": p.attainment == null ? "" : Math.round(p.attainment),
              "Actual Sales": Math.round(p.sales),
            }))
          }
        />
        <input
          type="search"
          placeholder="Search PA or team leader…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-xs">
              <tr>
                <Th k="name" label="PA" />
                <th className="px-2 py-2 text-left font-medium text-slate-500">Team Leader</th>
                <Th k="leads" label="Leads" right />
                <Th k="nuTotal" label="NU" right />
                <Th k="attainment" label="Attain." right />
                <Th k="sales" label="Actual Sales" right />
              </tr>
            </thead>
            <tbody>
              {sortedPas.slice(0, 150).map((p) => (
                <tr key={p.name} className="border-b border-slate-50 last:border-0">
                  <td className="px-2 py-2 font-medium text-slate-800">{p.name}</td>
                  <td className="px-2 py-2 text-slate-500">{p.asm}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtInt(p.leads)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtInt(p.nuTotal)}</td>
                  <td className="px-2 py-2 text-right"><AttainmentPill pct={p.attainment} /></td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums text-teal-700">
                    {fmtInt(p.sales)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedPas.length > 150 && (
          <p className="py-2 text-center text-xs text-slate-400">
            Showing first 150 of {sortedPas.length}.
          </p>
        )}
      </div>

      {/* Sales source diagnostics */}
      <details className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-700">
          Sales source (diagnostics)
        </summary>
        <div className="mt-2 space-y-0.5">
          <div className="flex justify-between border-b border-slate-100 py-0.5">
            <span>Sales rows / distinct codes</span>
            <span className="tabular-nums">
              {model.sales.debug?.rows ?? 0} / {model.sales.debug?.distinctCodes ?? 0}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-0.5">
            <span>Code column / Sales column</span>
            <span className="text-right">
              {model.sales.debug?.codeHeader || "(none)"} /{" "}
              {model.sales.debug?.salesHeader || "(none)"}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-0.5">
            <span>Total sales / matched to a PA</span>
            <span className="tabular-nums">
              {fmtInt(model.sales.total)} / {fmtInt(model.salesTotal)} (
              {fmtPct(model.salesMatchRate * 100)})
            </span>
          </div>
          <div className="pt-1">
            <div className="font-medium text-slate-500">Sales headers detected:</div>
            <div className="break-all font-mono text-[10px]">
              [{(model.sales.debug?.headers || []).map((h) => `"${h}"`).join(", ")}]
            </div>
          </div>
        </div>
      </details>

      <p className="mt-3 text-[11px] text-slate-400">
        Actual sales come from the Daily Sales workbook&rsquo;s export tab, summed
        per Customer Code and joined to each outlet&rsquo;s Code on the Target tab.
        Only PAs under a Team Leader are shown.
      </p>
    </div>
  );
}
