"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../lib/useData";
import { buildPASummaries, type PASummary } from "../lib/model";
import { fmtInt } from "../lib/format";
import { DataStatus, LoadingState } from "../components/DataStatus";
import { AttainmentPill } from "../components/ui";
import { useDebounced } from "../lib/hooks";

type SortKey = "leads" | "nuTotal" | "attainment" | "name" | "asm";

export function LeaderboardView() {
  const data = useDashboardData();
  const { model } = data;
  const [sortKey, setSortKey] = useState<SortKey>("leads");
  const [asc, setAsc] = useState(false);
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 250).toLowerCase();

  const rows = useMemo(() => {
    if (!model) return [];
    const all = buildPASummaries(model).filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.asm.toLowerCase().includes(q)
    );
    const dir = asc ? 1 : -1;
    return [...all].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "name" || sortKey === "asm") {
        av = a[sortKey].toLowerCase();
        bv = b[sortKey].toLowerCase();
        return av < bv ? -dir : av > bv ? dir : 0;
      }
      av = (a[sortKey] as number | null) ?? -1;
      bv = (b[sortKey] as number | null) ?? -1;
      return (av - bv) * dir;
    });
  }, [model, q, sortKey, asc]);

  if (!model) return <LoadingState />;

  const setSort = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "name" || k === "asm");
    }
  };

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
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
      <input
        type="search"
        placeholder="Search PA or team leader…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
      />
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-xs">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-slate-500">#</th>
              <Th k="name" label="PA" />
              <Th k="asm" label="Team Leader" />
              <Th k="leads" label="Leads" right />
              <Th k="nuTotal" label="NU" right />
              <Th k="attainment" label="Attain." right />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 150).map((s: PASummary, i) => (
              <tr key={s.name} className="border-b border-slate-50 last:border-0">
                <td className="px-2 py-2 tabular-nums text-slate-400">{i + 1}</td>
                <td className="px-2 py-2 font-medium text-slate-800">{s.name}</td>
                <td className="px-2 py-2 text-slate-500">{s.asm}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtInt(s.leads)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtInt(s.nuTotal)}</td>
                <td className="px-2 py-2 text-right">
                  <AttainmentPill pct={s.attainment} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 150 && (
        <p className="py-2 text-center text-xs text-slate-400">
          Showing first 150 of {rows.length}.
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        Attainment is the combined figure over target months (Jan/Feb/Apr 2026).
        Tap a column header to sort.
      </p>
    </div>
  );
}
