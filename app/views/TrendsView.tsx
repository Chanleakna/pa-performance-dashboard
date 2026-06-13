"use client";

import { useMemo } from "react";
import { useDashboardData } from "../lib/useData";
import {
  leadsByMonth,
  overallAttainmentForMonth,
  teamAttainment,
} from "../lib/model";
import { monthLabel } from "../lib/parse";
import { fmtInt, statusColor } from "../lib/format";
import { attainmentStatus } from "../lib/model";
import { DataStatus, LoadingState } from "../components/DataStatus";
import { LabeledBarChart } from "../components/charts";
import { AttainmentPill, SectionTitle } from "../components/ui";

export function TrendsView() {
  const data = useDashboardData();
  const { model } = data;

  const leadsData = useMemo(() => {
    if (!model) return [];
    const byMonth = leadsByMonth(model);
    return model.dailyMonths.map((m) => ({
      label: monthLabel(m).replace(" 20", " '"),
      leads: byMonth.get(m) || 0,
    }));
  }, [model]);

  const attData = useMemo(() => {
    if (!model) return [];
    return model.attainmentMonths.map((m) => ({
      label: monthLabel(m).replace(" 20", " '"),
      pct: Math.round(overallAttainmentForMonth(model, m) || 0),
    }));
  }, [model]);

  const teamMatrix = useMemo(() => {
    if (!model) return [];
    return model.asms.map((asm) => ({
      asm,
      byMonth: model.attainmentMonths.map((m) => ({
        month: m,
        pct: teamAttainment(model, asm, [m]),
      })),
      combined: teamAttainment(model, asm, model.attainmentMonths),
    }));
  }, [model]);

  if (!model) return <LoadingState />;

  return (
    <div>
      <DataStatus data={data} />

      <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <SectionTitle hint="all months with leads">Team leads by month</SectionTitle>
        <LabeledBarChart
          data={leadsData}
          dataKey="leads"
          xKey="label"
          color="#2563eb"
          valueFormatter={(v) => fmtInt(v)}
        />
      </div>

      <div className="mt-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <SectionTitle hint="target months only (Jan/Feb/Apr)">
          Team attainment % by month
        </SectionTitle>
        <LabeledBarChart
          data={attData}
          dataKey="pct"
          xKey="label"
          colorFor={(row) => statusColor(attainmentStatus(row.pct))}
          valueFormatter={(v) => `${v}%`}
        />
        <p className="mt-1 text-[11px] text-slate-400">
          March is excluded — it has no Tar.Lead (only Quali.Lead).
        </p>
      </div>

      <div className="mt-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <SectionTitle>Attainment by Team Leader</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-1 pr-2 font-medium">Team Leader</th>
                {model.attainmentMonths.map((m) => (
                  <th key={m} className="py-1 pr-2 text-right font-medium">
                    {monthLabel(m).split(" ")[0]}
                  </th>
                ))}
                <th className="py-1 pr-2 text-right font-medium">Combined</th>
              </tr>
            </thead>
            <tbody>
              {teamMatrix.map((row) => (
                <tr key={row.asm} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 font-medium text-slate-700">{row.asm}</td>
                  {row.byMonth.map((c) => (
                    <td key={c.month} className="py-1.5 pr-2 text-right">
                      <AttainmentPill pct={c.pct} />
                    </td>
                  ))}
                  <td className="py-1.5 pr-2 text-right">
                    <AttainmentPill pct={row.combined} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
