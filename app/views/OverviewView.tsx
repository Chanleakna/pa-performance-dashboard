"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useDashboardData } from "../lib/useData";
import {
  attainmentOverMonths,
  actLeadForPa,
  actLeadForPaMonth,
  salesForPa,
  salesTargetForPa,
  tarLeadForPaMonth,
  targetLeadForPaMonth,
} from "../lib/model";
import { type MonthKey, monthLabel, normCode } from "../lib/parse";
import { fmtInt, fmtPct } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import { DataStatus, LoadingState } from "../components/DataStatus";
import { AttainmentPill } from "../components/ui";
import { CascadingSlicers, type SlicerState } from "../components/Slicers";
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

interface OvRow {
  name: string;
  asm: string;
  leads: number;
  leadTar: number;
  leadPct: number | null;
  nu: number;
  attainment: number | null;
  sales: number;
  salesTar: number;
  salesPct: number | null;
}

/** Green/red % cell style (≥100 green, <100 red), shaded by distance. */
function pctStyle(pct: number | null): React.CSSProperties {
  if (pct == null) return { backgroundColor: "#f1f5f9", color: "#94a3b8" };
  if (pct >= 100) {
    const i = Math.min((pct - 100) / 100, 1);
    return { backgroundColor: `rgba(22,163,74,${0.2 + 0.6 * i})`, color: i > 0.45 ? "#fff" : "#14532d" };
  }
  const i = Math.min((100 - pct) / 100, 1);
  return { backgroundColor: `rgba(220,38,38,${0.18 + 0.62 * i})`, color: i > 0.5 ? "#fff" : "#7f1d1d" };
}
const pctTxt = (p: number | null) => (p == null ? "—" : `${Math.round(p)}%`);

/** One matrix cell: Act/Tar on top, a colored % beneath. */
function MatrixCell({
  act,
  tar,
  pct,
}: {
  act: number;
  tar: number;
  pct: number | null;
}) {
  return (
    <td className="whitespace-nowrap border-b border-l border-slate-100 px-1 py-0.5 text-center">
      <div className="tabular-nums text-slate-500">
        {fmtInt(act)}/{fmtInt(tar)}
      </div>
      <div
        className="mt-0.5 rounded font-semibold tabular-nums"
        style={pctStyle(pct)}
      >
        {pctTxt(pct)}
      </div>
    </td>
  );
}

type PaSort = "sales" | "leads" | "nu" | "attainment" | "name";

export function OverviewView() {
  const data = useDashboardData();
  const { model } = data;
  const [slicer, setSlicer] = useState<SlicerState>({
    years: [],
    months: [],
    asms: [],
    pas: [],
  });
  const [defaulted, setDefaulted] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<PaSort>("sales");
  const [asc, setAsc] = useState(false);
  const q = useDebounced(query, 250).toLowerCase();

  const allMonths = useMemo<MonthKey[]>(() => {
    if (!model) return [];
    return Array.from(
      new Set([...model.dailyMonths, ...model.targetMonths, ...model.sales.months])
    ).sort();
  }, [model]);
  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const m of allMonths) ys.add(m.slice(0, 4));
    return Array.from(ys).sort();
  }, [allMonths]);

  // Default the slicers to the latest year + month once data first loads.
  useEffect(() => {
    if (!model || defaulted || !model.dailyMonths.length) return;
    const latest = model.dailyMonths[model.dailyMonths.length - 1];
    setSlicer((s) => ({ ...s, years: [latest.slice(0, 4)], months: [latest] }));
    setDefaulted(true);
  }, [model, defaulted]);

  const monthScope = useMemo<MonthKey[] | null>(() => {
    if (slicer.months.length) return slicer.months;
    if (slicer.years.length)
      return allMonths.filter((m) => slicer.years.some((y) => m.startsWith(y + "-")));
    return null;
  }, [slicer.months, slicer.years, allMonths]);

  const pasForAsmsFn = useMemo(() => {
    return (asms: string[]) => {
      if (!model) return [];
      const list = asms.length
        ? model.pas.filter((p) => asms.includes(p.asm))
        : model.pas;
      return list.map((p) => p.name);
    };
  }, [model]);

  // PAs in scope (by PATL/PA selection).
  const scopePas = useMemo(() => {
    if (!model) return [];
    return model.pas.filter((p) => {
      if (slicer.pas.length) return slicer.pas.includes(p.name);
      if (slicer.asms.length) return slicer.asms.includes(p.asm);
      return true;
    });
  }, [model, slicer.pas, slicer.asms]);

  // Months shown as columns in the monthly matrix: the 12 months of the
  // selected year(s) (defaults to 2026), Jan→Dec.
  const matrixMonths = useMemo<MonthKey[]>(() => {
    const ys = slicer.years.length ? slicer.years : ["2026"];
    const ms: MonthKey[] = [];
    for (const y of ys)
      for (let i = 1; i <= 12; i++) ms.push(`${y}-${String(i).padStart(2, "0")}`);
    return Array.from(new Set(ms)).sort();
  }, [slicer.years]);

  // Monthly matrix — ONE ROW PER STORE (outlet), never merged. Everything is
  // per-outlet from the Target tab + sales joined by Customer Code:
  //   Lead Act = Act.Lead, Lead Tar = Tar.Lead (or Quali.Lead in March)
  //   Sales Act = actual sales, Sales Tar = sales target (ex-VAT)
  const matrix = useMemo(() => {
    if (!model) return [];
    const inScope = (r: { paName: string; asm: string }) => {
      if (slicer.pas.length) return slicer.pas.includes(r.paName);
      if (slicer.asms.length) return slicer.asms.includes(r.asm);
      return true;
    };
    const list = model.target.rows
      .filter((r) => (r.outlet || r.paName) && inScope(r))
      .map((r) => {
        const code = normCode(r.code);
        const sAll = model.sales.byCodeMonth[code] || {};
        const stAll = model.salesTarget.byCodeMonth[code] || {};
        const cells = matrixMonths.map((m) => {
          const cell = r.months[m];
          const lt = cell?.tarLead ?? cell?.qualiLead ?? 0;
          const la = cell?.actLead ?? 0;
          const sa = sAll[m] || 0;
          const st = stAll[m] || 0;
          return {
            la,
            lt,
            lp: lt > 0 ? (la / lt) * 100 : null,
            sa,
            st,
            sp: st > 0 ? (sa / st) * 100 : null,
          };
        });
        const totLeads = cells.reduce((s, c) => s + c.la, 0);
        const totSales = cells.reduce((s, c) => s + c.sa, 0);
        return {
          store: r.outlet || "—",
          name: r.paName || "—",
          asm: r.asm,
          cells,
          totLeads,
          totSales,
        };
      });
    return list;
  }, [model, slicer.pas, slicer.asms, matrixMonths]);

  // Matrix sorting. Key: "name" | "totLead" | "totSales" | "lead:idx" | "sales:idx".
  const [mSort, setMSort] = useState("totLead");
  const [mAsc, setMAsc] = useState(false);
  const sortedMatrix = useMemo(() => {
    const dir = mAsc ? 1 : -1;
    const [type, idxStr] = mSort.split(":");
    const idx = Number(idxStr);
    const val = (r: (typeof matrix)[number]) => {
      if (type === "name") return null;
      if (type === "totLead") return r.totLeads;
      if (type === "totSales") return r.totSales;
      if (type === "lead") return r.cells[idx]?.la ?? -1;
      if (type === "sales") return r.cells[idx]?.sa ?? -1;
      return 0;
    };
    const arr = [...matrix].sort((a, b) => {
      if (type === "name") return a.store.localeCompare(b.store) * dir;
      return ((val(a) as number) - (val(b) as number)) * dir;
    });
    return arr.slice(0, 200).map((r, i) => ({ ...r, rank: i + 1 }));
  }, [matrix, mSort, mAsc]);

  const setMatrixSort = (k: string) => {
    if (k === mSort) setMAsc((v) => !v);
    else {
      setMSort(k);
      setMAsc(k === "name");
    }
  };

  // Per-PA rows, scoped by the slicers. Leads/NU/attainment respect the month
  // scope; actual sales are cumulative (no month dimension in the sales tab).
  const rows = useMemo<OvRow[]>(() => {
    if (!model) return [];
    const attMonths = (monthScope ?? model.attainmentMonths).filter((m) =>
      model.attainmentMonths.includes(m)
    );
    const tgtMonths = monthScope ?? model.targetMonths;
    return scopePas.map((p) => {
      const leads = monthScope
        ? monthScope.reduce((s, m) => s + actLeadForPaMonth(model, p.name, m), 0)
        : actLeadForPa(model, p.name);
      const leadTar = tgtMonths.reduce(
        (s, m) => s + targetLeadForPaMonth(model, p.name, m),
        0
      );
      const nu = (model.nuByPa[p.name] || []).filter(
        (r) => !monthScope || monthScope.includes(r.month)
      ).length;
      const sales = salesForPa(model, p.name, monthScope);
      const salesTar = salesTargetForPa(model, p.name, monthScope);
      return {
        name: p.name,
        asm: p.asm,
        leads,
        leadTar,
        leadPct: leadTar > 0 ? (leads / leadTar) * 100 : null,
        nu,
        attainment: attainmentOverMonths(model, p.name, attMonths),
        sales,
        salesTar,
        salesPct: salesTar > 0 ? (sales / salesTar) * 100 : null,
      };
    });
  }, [model, scopePas, monthScope]);

  // Team Leader aggregation from the scoped rows.
  const asmRows = useMemo(() => {
    if (!model) return [];
    const map = new Map<string, OvRow[]>();
    for (const r of rows) {
      if (!map.has(r.asm)) map.set(r.asm, []);
      map.get(r.asm)!.push(r);
    }
    const attMonths = (monthScope ?? model.attainmentMonths).filter((m) =>
      model.attainmentMonths.includes(m)
    );
    return Array.from(map.entries())
      .map(([asm, teamPas]) => {
        let a = 0;
        let t = 0;
        for (const p of teamPas)
          for (const m of attMonths) {
            const tt = tarLeadForPaMonth(model, p.name, m);
            if (tt > 0) {
              t += tt;
              a += actLeadForPaMonth(model, p.name, m);
            }
          }
        return {
          asm,
          paCount: teamPas.length,
          leads: teamPas.reduce((s, p) => s + p.leads, 0),
          nu: teamPas.reduce((s, p) => s + p.nu, 0),
          sales: teamPas.reduce((s, p) => s + p.sales, 0),
          attainment: t > 0 ? (a / t) * 100 : null,
        };
      })
      .sort((x, y) => y.sales - x.sales);
  }, [model, rows, monthScope]);

  // Team Leader summary sorting.
  type AsmSort = "asm" | "paCount" | "leads" | "nu" | "attainment" | "sales";
  const [aSort, setASort] = useState<AsmSort>("sales");
  const [aAsc, setAAsc] = useState(false);
  const sortedAsmRows = useMemo(() => {
    const dir = aAsc ? 1 : -1;
    return [...asmRows].sort((a, b) => {
      if (aSort === "asm") return a.asm.localeCompare(b.asm) * dir;
      const av = (a[aSort] as number | null) ?? -1;
      const bv = (b[aSort] as number | null) ?? -1;
      return (av - bv) * dir;
    });
  }, [asmRows, aSort, aAsc]);
  const setAsmSort = (k: AsmSort) => {
    if (k === aSort) setAAsc((v) => !v);
    else {
      setASort(k);
      setAAsc(k === "asm");
    }
  };

  const sortedPas = useMemo(() => {
    const filtered = rows.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.asm.toLowerCase().includes(q)
    );
    const dir = asc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      const av = (a[sortKey] as number | null) ?? -1;
      const bv = (b[sortKey] as number | null) ?? -1;
      return (av - bv) * dir;
    });
  }, [rows, q, sortKey, asc]);

  if (!model) return <LoadingState />;

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

      <CascadingSlicers
        state={slicer}
        onChange={setSlicer}
        years={years}
        months={allMonths}
        asms={model.asms}
        pasForAsms={pasForAsmsFn}
      />

      {model.salesTotal === 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          No actual sales matched. Check the Daily Sales{" "}
          <span className="font-medium">export</span> tab is Published to web as
          CSV — see the Sales diagnostics at the bottom.
        </div>
      )}

      {/* Monthly matrix: Rank · Store · PA, then per-month Lead & Sales vs Target */}
      <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <PanelHead
          title="Monthly Lead & Sales vs Target by Store"
          hint="one row per store · Lead & Sales (Act/Tar/%)"
          exportName="overview-monthly-matrix"
          exportRows={() =>
            sortedMatrix.map((p) => {
              const out: Record<string, unknown> = {
                Rank: p.rank,
                Store: p.store,
                PA: p.name,
                "Team Leader": p.asm,
              };
              matrixMonths.forEach((m, i) => {
                const c = p.cells[i];
                const lbl = monthLabel(m).replace(" 20", " '");
                out[`${lbl} Lead Act`] = c.la;
                out[`${lbl} Lead Tar`] = c.lt;
                out[`${lbl} Lead %`] = c.lp == null ? "" : Math.round(c.lp);
                out[`${lbl} Sales Act`] = Math.round(c.sa);
                out[`${lbl} Sales Tar`] = Math.round(c.st);
                out[`${lbl} Sales %`] = c.sp == null ? "" : Math.round(c.sp);
              });
              return out;
            })
          }
        />
        <div className="no-scrollbar max-h-[75vh] overflow-auto">
          <table className="border-separate border-spacing-0 text-[10px]">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  onClick={() => setMatrixSort("name")}
                  className="sticky left-0 top-0 z-40 cursor-pointer select-none border-b border-slate-200 bg-white px-2 py-1 text-left font-medium text-slate-500 hover:text-brand-700"
                >
                  # · Store · PA · PATL
                  {mSort === "name" ? (mAsc ? " ▲" : " ▼") : " ↕"}
                </th>
                {matrixMonths.map((m) => (
                  <th
                    key={m}
                    colSpan={2}
                    className="sticky top-0 z-20 border-b border-l border-slate-200 bg-white px-1 py-1 text-center font-semibold text-slate-600"
                  >
                    {monthLabel(m).replace(" 20", " '")}
                  </th>
                ))}
              </tr>
              <tr>
                {matrixMonths.map((m, i) => (
                  <Fragment key={m}>
                    <th
                      onClick={() => setMatrixSort(`lead:${i}`)}
                      className="sticky top-[25px] z-20 cursor-pointer select-none border-b border-l border-slate-200 bg-white px-1 py-0.5 text-center font-medium text-brand-600 hover:bg-brand-50"
                    >
                      Lead{mSort === `lead:${i}` ? (mAsc ? " ▲" : " ▼") : ""}
                    </th>
                    <th
                      onClick={() => setMatrixSort(`sales:${i}`)}
                      className="sticky top-[25px] z-20 cursor-pointer select-none border-b border-slate-200 bg-white px-1 py-0.5 text-center font-medium text-teal-700 hover:bg-teal-50"
                    >
                      Sales{mSort === `sales:${i}` ? (mAsc ? " ▲" : " ▼") : ""}
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMatrix.map((p) => (
                <tr key={p.rank} className="align-middle">
                  <td
                    className="sticky left-0 z-10 max-w-[190px] truncate border-b border-slate-100 bg-white px-2 py-1"
                    title={`${p.store} · ${p.name} · ${p.asm}`}
                  >
                    <div className="truncate font-medium text-slate-800">
                      <span className="text-slate-400">#{p.rank}</span> {p.store}
                    </div>
                    <div className="truncate text-[9px] text-slate-500">
                      {p.name} · <span className="text-brand-600">{p.asm}</span>
                    </div>
                  </td>
                  {p.cells.map((c, i) => (
                    <Fragment key={i}>
                      <MatrixCell act={c.la} tar={c.lt} pct={c.lp} />
                      <MatrixCell act={c.sa} tar={c.st} pct={c.sp} />
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          One row per store. Each month shows{" "}
          <span className="font-medium text-brand-600">Lead</span> (Act.Lead /
          Tar.Lead) and <span className="font-medium text-teal-700">Sales</span>{" "}
          (actual / target) as Act/Tar with a % (
          <span className="font-medium text-emerald-700">green</span> ≥100%,{" "}
          <span className="font-medium text-red-700">red</span> below). Actual
          sales are ×1.1 (with VAT) to match the VAT-inclusive target. Ranked by
          total Act.Lead.
        </p>
      </div>

      {/* Team Leader summary */}
      <div className="mt-3 overflow-x-auto rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <PanelHead
          title="Team Leader summary"
          exportName="overview-by-patl"
          exportRows={() =>
            asmRows.map((r) => ({
              "Team Leader": r.asm,
              PAs: r.paCount,
              Leads: r.leads,
              "New Users": r.nu,
              "Attainment %": r.attainment == null ? "" : Math.round(r.attainment),
              "Actual Sales": Math.round(r.sales),
            }))
          }
        />
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-xs">
            <tr>
              {(
                [
                  ["asm", "Team Leader", false],
                  ["paCount", "PAs", true],
                  ["leads", "Leads", true],
                  ["nu", "NU", true],
                  ["attainment", "Attain.", true],
                  ["sales", "Actual Sales", true],
                ] as [AsmSort, string, boolean][]
              ).map(([k, label, right]) => (
                <th
                  key={k}
                  onClick={() => setAsmSort(k)}
                  className={
                    "cursor-pointer select-none px-2 py-2 font-medium text-slate-500 hover:text-brand-700 " +
                    (right ? "text-right" : "text-left")
                  }
                >
                  {label}
                  {aSort === k && <span className="ml-0.5 text-brand-600">{aAsc ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedAsmRows.map((r) => (
              <tr key={r.asm} className="border-b border-slate-50 last:border-0">
                <td className="px-2 py-2 font-medium text-slate-800">{r.asm}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500">{r.paCount}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtInt(r.leads)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtInt(r.nu)}</td>
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
              "New Users": p.nu,
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
                <Th k="nu" label="NU" right />
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
                  <td className="px-2 py-2 text-right tabular-nums">{fmtInt(p.nu)}</td>
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
            <span>Code col / Sales col</span>
            <span className="text-right">
              {model.sales.debug?.codeHeader || "(none)"} /{" "}
              {model.sales.debug?.salesHeader || "(none)"}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-0.5">
            <span>Year col / Month col</span>
            <span className="text-right">
              {model.sales.debug?.yearHeader || "(none)"} /{" "}
              {model.sales.debug?.monthHeader || "(none)"}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-0.5">
            <span>Sales months detected</span>
            <span className="text-right">
              {model.sales.months.join(", ") || "(none)"}
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

          <div className="mt-2 border-t border-slate-200 pt-2 font-medium text-slate-500">
            Sales TARGET
          </div>
          <div className="flex justify-between border-b border-slate-100 py-0.5">
            <span>Target rows / distinct codes / month cols</span>
            <span className="tabular-nums">
              {model.salesTarget.debug?.rows ?? 0} /{" "}
              {model.salesTarget.debug?.distinctCodes ?? 0} /{" "}
              {model.salesTarget.debug?.monthCols ?? 0}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-0.5">
            <span>Target total / matched to a PA</span>
            <span className="tabular-nums">
              {fmtInt(model.salesTarget.total)} / {fmtInt(model.salesTargetTotal)} (
              {fmtPct(model.salesTargetMatchRate * 100)})
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-0.5">
            <span>Target months detected</span>
            <span className="text-right">
              {model.salesTarget.months.join(", ") || "(none)"}
            </span>
          </div>
          <div className="pt-1">
            <div className="font-medium text-slate-500">Target header row:</div>
            <div className="break-all font-mono text-[10px]">
              [{(model.salesTarget.debug?.headerSample || []).map((h) => `"${h}"`).join(", ")}]
            </div>
          </div>
          <div className="pt-1">
            <div className="font-medium text-slate-500">
              Join sample — PA[code] = actualSales / targetSales:
            </div>
            <div className="break-all font-mono text-[10px]">
              {model.target.rows
                .slice(0, 8)
                .map((r) => {
                  const c = r.code.trim().toLowerCase();
                  const a = Math.round(model.sales.byCode[c] || 0);
                  const t = Math.round(model.salesTarget.byCode[c] || 0);
                  return `${r.paName || "?"}[${r.code}]=${a}/${t}`;
                })
                .join("  ·  ") || "(none)"}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
