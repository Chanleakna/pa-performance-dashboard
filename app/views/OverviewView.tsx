"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../lib/useData";
import {
  attainmentPct,
  buildPASummaries,
  leadsForPaMonth,
  tarLeadForPaMonth,
  type DashboardModel,
} from "../lib/model";
import { monthLabel } from "../lib/parse";
import { BRANDS } from "../lib/config";
import { fmtInt } from "../lib/format";
import { DataStatus, LoadingState } from "../components/DataStatus";
import { AttainmentPill, CollapsibleCard, StatCard } from "../components/ui";
import { useDebounced } from "../lib/hooks";

function MonthlyDetail({ model, paName }: { model: DashboardModel; paName: string }) {
  // Show every month that has leads OR a target, sorted.
  const months = useMemo(() => {
    const set = new Set<string>([...model.dailyMonths, ...model.targetMonths]);
    return Array.from(set).sort();
  }, [model]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="py-1 pr-2 font-medium">Month</th>
            <th className="py-1 pr-2 text-right font-medium">Leads</th>
            <th className="py-1 pr-2 text-right font-medium">Target</th>
            <th className="py-1 pr-2 text-right font-medium">Attain.</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const leads = leadsForPaMonth(model, paName, m);
            const tar = tarLeadForPaMonth(model, paName, m);
            const att = attainmentPct(model, paName, m);
            if (leads === 0 && tar === 0) return null;
            return (
              <tr key={m} className="border-t border-slate-100">
                <td className="py-1 pr-2 text-slate-600">{monthLabel(m)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{fmtInt(leads)}</td>
                <td className="py-1 pr-2 text-right tabular-nums text-slate-500">
                  {tar > 0 ? fmtInt(tar) : "—"}
                </td>
                <td className="py-1 pr-2 text-right">
                  <AttainmentPill pct={att} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">
        Attainment = daily leads ÷ Tar.Lead. Months without a Tar.Lead (e.g.
        March) show leads but no attainment.
      </p>
    </div>
  );
}

export function OverviewView() {
  const data = useDashboardData();
  const { model } = data;
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 250).toLowerCase();

  const summaries = useMemo(
    () => (model ? buildPASummaries(model) : []),
    [model]
  );

  const filtered = useMemo(
    () =>
      summaries.filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.asm.toLowerCase().includes(q) ||
          s.outlet.toLowerCase().includes(q)
      ),
    [summaries, q]
  );

  if (!model) return <LoadingState />;

  return (
    <div>
      <DataStatus data={data} />

      <div className="mb-3 grid grid-cols-3 gap-2">
        <StatCard label="PAs" value={fmtInt(model.pas.length)} />
        <StatCard
          label="Total Leads"
          value={fmtInt(model.daily.length)}
          accent="brand"
        />
        <StatCard label="New Users" value={fmtInt(model.nu.length)} accent="teal" />
      </div>

      <input
        type="search"
        placeholder="Search PA, team leader, outlet…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
      />

      <div className="space-y-2">
        {filtered.slice(0, 150).map((s) => (
          <CollapsibleCard
            key={s.name}
            title={s.name}
            subtitle={`${s.asm} · ${s.outlet || "—"}`}
            right={<AttainmentPill pct={s.attainment} />}
          >
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Leads" value={fmtInt(s.leads)} />
              <StatCard
                label="Attainment"
                value={<AttainmentPill pct={s.attainment} />}
                sub="Jan/Feb/Apr"
                accent="slate"
              />
              <StatCard label="New Users" value={fmtInt(s.nuTotal)} accent="teal" />
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                New users by brand
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BRANDS.map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200"
                  >
                    {b}
                    <span className="font-semibold tabular-nums text-slate-800">
                      {fmtInt(s.nuByBrand[b] || 0)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Monthly detail
              </div>
              <MonthlyDetail model={model} paName={s.name} />
            </div>
          </CollapsibleCard>
        ))}
        {filtered.length > 150 && (
          <p className="py-2 text-center text-xs text-slate-400">
            Showing first 150 of {filtered.length}. Refine your search.
          </p>
        )}
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">No PAs match.</p>
        )}
      </div>
    </div>
  );
}
