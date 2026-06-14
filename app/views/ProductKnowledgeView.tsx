"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useDashboardData } from "../lib/useData";
import { type MonthKey, monthLabel, normName } from "../lib/parse";
import { downloadCsv } from "../lib/csv";
import { DataStatus, LoadingState } from "../components/DataStatus";
import { CascadingSlicers, type SlicerState } from "../components/Slicers";

/** Result color: green ≥90%, amber 75–89%, red below. */
function pkStyle(pct: number | null): React.CSSProperties {
  if (pct == null) return { backgroundColor: "#f1f5f9", color: "#94a3b8" };
  if (pct >= 90) {
    const i = Math.min((pct - 90) / 10, 1);
    return { backgroundColor: `rgba(22,163,74,${0.3 + 0.5 * i})`, color: i > 0.4 ? "#fff" : "#14532d" };
  }
  if (pct >= 75) return { backgroundColor: "rgba(217,119,6,0.5)", color: "#7c2d12" };
  const i = Math.min((75 - pct) / 75, 1);
  return { backgroundColor: `rgba(220,38,38,${0.3 + 0.5 * i})`, color: i > 0.4 ? "#fff" : "#7f1d1d" };
}

type Sort = "name" | "total" | number;
const nv = (v: number | null) => (v == null ? -1 : v);

export function ProductKnowledgeView() {
  const data = useDashboardData();
  const { model } = data;
  const [slicer, setSlicer] = useState<SlicerState>({ years: [], months: [], asms: [], pas: [] });
  const [defaulted, setDefaulted] = useState(false);
  const [sortKey, setSortKey] = useState<Sort>("total");
  const [asc, setAsc] = useState(false);

  // Months present in the Training Result tab.
  const allMonths = useMemo<MonthKey[]>(() => {
    if (!model) return [];
    return Array.from(new Set(model.training.map((t) => t.month).filter(Boolean))).sort();
  }, [model]);
  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const m of allMonths) ys.add(m.slice(0, 4));
    return Array.from(ys).sort();
  }, [allMonths]);

  useEffect(() => {
    if (!model || defaulted || !years.length) return;
    // Default Year to the latest; leave Month "all" so every month column shows.
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

  const months = useMemo(
    () => (slicer.years.length ? allMonths.filter((m) => slicer.years.some((y) => m.startsWith(y + "-"))) : allMonths),
    [allMonths, slicer.years]
  );

  // Rows: one per trainee Name, per-month average % Achieve (+ attempt count).
  const rows = useMemo(() => {
    if (!model) return [];
    // name -> month -> {sum, n}
    const byName = new Map<string, { name: string; asm: string; cells: Map<string, { sum: number; n: number }> }>();
    for (const t of model.training) {
      if (!t.name || !t.month || t.pctAchieve == null) continue;
      let rec = byName.get(t.name);
      if (!rec) {
        rec = { name: t.name, asm: model.paToAsm[normName(t.name)] || "—", cells: new Map() };
        byName.set(t.name, rec);
      }
      const c = rec.cells.get(t.month) || { sum: 0, n: 0 };
      c.sum += t.pctAchieve;
      c.n += 1;
      rec.cells.set(t.month, c);
    }
    let list = Array.from(byName.values()).map((rec) => {
      const cells = months.map((m) => {
        const c = rec.cells.get(m);
        return c ? { pct: c.sum / c.n, n: c.n } : { pct: null as number | null, n: 0 };
      });
      const valid = cells.filter((c) => c.pct != null);
      const total = valid.length ? valid.reduce((s, c) => s + (c.pct as number), 0) / valid.length : null;
      return { name: rec.name, asm: rec.asm, cells, total };
    });
    // Filter by PATL / PA slicers.
    if (slicer.pas.length) list = list.filter((r) => slicer.pas.includes(r.name));
    else if (slicer.asms.length) list = list.filter((r) => slicer.asms.includes(r.asm));
    return list;
  }, [model, months, slicer.pas, slicer.asms]);

  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      const av = sortKey === "total" ? a.total : a.cells[sortKey].pct;
      const bv = sortKey === "total" ? b.total : b.cells[sortKey].pct;
      return (nv(av) - nv(bv)) * dir;
    });
  }, [rows, sortKey, asc]);

  if (!model) return <LoadingState />;

  const setSort = (k: Sort) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "name");
    }
  };
  const caret = (active: boolean) => (active ? (asc ? " ▲" : " ▼") : " ↕");
  const cellCls = "whitespace-nowrap rounded px-1.5 py-1 text-right tabular-nums";
  const headCls = cellCls + " sticky top-0 z-20 cursor-pointer select-none bg-white font-medium hover:text-brand-700";
  const nameBody = "sticky left-0 z-10 max-w-[160px] truncate bg-white px-1.5 py-1 text-left";

  const exportRows = () =>
    sorted.map((r) => {
      const out: Record<string, unknown> = { PA: r.name, "Team Leader": r.asm };
      months.forEach((m, i) => {
        out[monthLabel(m)] = r.cells[i].pct == null ? "" : Math.round(r.cells[i].pct as number);
      });
      out["Avg %"] = r.total == null ? "" : Math.round(r.total);
      return out;
    });

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

      <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">
            Product Knowledge — % Result by PA
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">% Achieve · by month</span>
            <button
              onClick={() => downloadCsv("product-knowledge", exportRows())}
              className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 hover:bg-brand-50"
            >
              ⬇ CSV
            </button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            No training results with a PA name in scope.
          </p>
        ) : (
          <div className="no-scrollbar max-h-[75vh] overflow-auto">
            <table className="border-separate border-spacing-0.5 text-[11px]">
              <thead>
                <tr className="text-slate-400">
                  <th
                    onClick={() => setSort("name")}
                    className="sticky left-0 top-0 z-30 cursor-pointer select-none bg-white px-1.5 py-1 text-left font-medium hover:text-brand-700"
                  >
                    # · PA · PATL{caret(sortKey === "name")}
                  </th>
                  {months.map((m, i) => (
                    <th key={m} onClick={() => setSort(i)} className={headCls}>
                      {monthLabel(m).replace(" 20", " '")}
                      {caret(sortKey === i)}
                    </th>
                  ))}
                  <th onClick={() => setSort("total")} className={headCls + " font-semibold text-slate-500"}>
                    Avg{caret(sortKey === "total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, ri) => (
                  <tr key={r.name}>
                    <td className={nameBody} title={`${r.name} · ${r.asm}`}>
                      <div className="text-slate-700">
                        <span className="text-slate-400">#{ri + 1}</span> {r.name}
                      </div>
                      <div className="truncate text-[9px] text-slate-400">{r.asm}</div>
                    </td>
                    {r.cells.map((c, i) => (
                      <td key={i} className={cellCls} style={pkStyle(c.pct)}>
                        {c.pct == null ? (
                          "—"
                        ) : (
                          <div className="leading-tight">
                            <div className="font-semibold">{Math.round(c.pct)}%</div>
                            {c.n > 1 && <div className="text-[9px] opacity-80">×{c.n}</div>}
                          </div>
                        )}
                      </td>
                    ))}
                    <td className={cellCls + " font-medium"} style={pkStyle(r.total)}>
                      {r.total == null ? "—" : `${Math.round(r.total)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          Cells = average <span className="font-medium">% Achieve</span> per PA per
          month (×n = number of topics that month). Green ≥90%, amber 75–89%, red
          below. Tap a column header to sort.
        </p>
      </div>
    </div>
  );
}
