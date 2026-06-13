"use client";

import { useMemo } from "react";
import { useDashboardData } from "../lib/useData";
import {
  buildASMRollups,
  buildPASummaries,
  type DashboardModel,
} from "../lib/model";
import { fmtInt } from "../lib/format";
import { DataStatus, LoadingState } from "../components/DataStatus";
import { AttainmentPill, CollapsibleCard, StatCard } from "../components/ui";
import { HorizontalLabeledBar } from "../components/charts";

function TeamMembers({ model, asm }: { model: DashboardModel; asm: string }) {
  const members = useMemo(
    () => buildPASummaries(model).filter((s) => s.asm === asm),
    [model, asm]
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="py-1 pr-2 font-medium">PA</th>
            <th className="py-1 pr-2 text-right font-medium">Leads</th>
            <th className="py-1 pr-2 text-right font-medium">NU</th>
            <th className="py-1 pr-2 text-right font-medium">Attain.</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.name} className="border-t border-slate-100">
              <td className="py-1 pr-2 text-slate-700">{m.name}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmtInt(m.leads)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmtInt(m.nuTotal)}</td>
              <td className="py-1 pr-2 text-right">
                <AttainmentPill pct={m.attainment} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AsmTeamsView() {
  const data = useDashboardData();
  const { model } = data;

  const rollups = useMemo(() => (model ? buildASMRollups(model) : []), [model]);
  const chartData = useMemo(
    () => rollups.map((r) => ({ asm: r.asm, leads: r.leads })),
    [rollups]
  );

  if (!model) return <LoadingState />;

  return (
    <div>
      <DataStatus data={data} />

      <div className="mb-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <div className="mb-1 text-sm font-semibold text-slate-800">
          Leads by Team Leader
        </div>
        <HorizontalLabeledBar
          data={chartData}
          dataKey="leads"
          yKey="asm"
          height={Math.max(180, chartData.length * 44)}
          valueFormatter={(v) => fmtInt(v)}
        />
      </div>

      <div className="space-y-2">
        {rollups.map((r) => (
          <CollapsibleCard
            key={r.asm}
            title={r.asm}
            subtitle={`${r.paCount} PA${r.paCount === 1 ? "" : "s"}`}
            right={<AttainmentPill pct={r.attainment} />}
          >
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Team Leads" value={fmtInt(r.leads)} />
              <StatCard label="New Users" value={fmtInt(r.nuTotal)} accent="teal" />
              <StatCard
                label="Attainment"
                value={<AttainmentPill pct={r.attainment} />}
                sub="Jan/Feb/Apr"
                accent="slate"
              />
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Team members
              </div>
              <TeamMembers model={model} asm={r.asm} />
            </div>
          </CollapsibleCard>
        ))}
      </div>
    </div>
  );
}
