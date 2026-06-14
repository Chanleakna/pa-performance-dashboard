"use client";

/**
 * Thin Recharts wrappers. Every bar chart shows value labels via <LabelList>,
 * per the spec. Palette is blue/corporate; red is reserved for below-target.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";

const AXIS = { fontSize: 11, fill: "#64748b" };

/** Two-line x-axis tick: day number on top, weekday beneath (from "26 Fri"). */
function DayWdTick(props: any) {
  const { x, y, payload } = props;
  const parts = String(payload?.value ?? "").split(" ");
  const day = parts[0] ?? "";
  const wd = parts[1] ?? "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={9} textAnchor="middle" fontSize={8} fill="#475569">
        {day}
      </text>
      {wd && (
        <text x={0} y={0} dy={18} textAnchor="middle" fontSize={7} fill="#94a3b8">
          {wd}
        </text>
      )}
    </g>
  );
}

/**
 * Daily lead bar chart: value labels on top, weekday x-axis, and "day off"
 * bars (e.g. Wednesday) shaded amber. data: { label: "26 Fri", leads, isOff }.
 */
export function DailyLeadChart({
  data,
  height = 250,
}: {
  data: Array<{ label: string; leads: number; isOff?: boolean }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 6, left: -18, bottom: 18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis
          dataKey="label"
          interval={0}
          tick={<DayWdTick />}
          height={26}
          tickLine={false}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="leads" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.isOff ? "#f59e0b" : "#60a5fa"} />
          ))}
          <LabelList
            dataKey="leads"
            position="top"
            style={{ fontSize: 9, fill: "#475569", fontWeight: 600 }}
            formatter={(v: any) => (v ? v : "")}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Simple vertical bar chart with value labels on top. */
export function LabeledBarChart({
  data,
  dataKey,
  xKey,
  color = "#2563eb",
  height = 240,
  colorFor,
  valueFormatter,
}: {
  data: Array<Record<string, any>>;
  dataKey: string;
  xKey: string;
  color?: string;
  height?: number;
  colorFor?: (row: Record<string, any>) => string;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} interval={0} angle={0} tickLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          formatter={(v: any) => (valueFormatter ? valueFormatter(Number(v)) : v)}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} fill={color}>
          {colorFor &&
            data.map((row, i) => <Cell key={i} fill={colorFor(row)} />)}
          <LabelList
            dataKey={dataKey}
            position="top"
            style={{ fontSize: 10, fill: "#475569", fontWeight: 600 }}
            formatter={(v: any) =>
              valueFormatter ? valueFormatter(Number(v)) : v
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bar chart (good for long category names like outlets / PAs). */
export function HorizontalLabeledBar({
  data,
  dataKey,
  yKey,
  color = "#2563eb",
  height = 280,
  valueFormatter,
}: {
  data: Array<Record<string, any>>;
  dataKey: string;
  yKey: string;
  color?: string;
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 36, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey={yKey}
          tick={{ ...AXIS, fontSize: 10 }}
          width={120}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: any) => (valueFormatter ? valueFormatter(Number(v)) : v)}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} fill={color}>
          <LabelList
            dataKey={dataKey}
            position="right"
            style={{ fontSize: 10, fill: "#475569", fontWeight: 600 }}
            formatter={(v: any) =>
              valueFormatter ? valueFormatter(Number(v)) : v
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Grouped bars (e.g. Tar.Lead vs Act.Lead per month) + value labels. */
export function GroupedBarChart({
  data,
  xKey,
  series,
  height = 260,
}: {
  data: Array<Record<string, any>>;
  xKey: string;
  series: Array<{ key: string; name: string; color: string }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} interval={0} tickLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]}>
            <LabelList
              dataKey={s.key}
              position="top"
              style={{ fontSize: 9, fill: "#475569", fontWeight: 600 }}
            />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Daily trend: bars for leads + a line for NU (composed), with labels off
 *  by default (too dense for daily) but tooltip on. */
export function DailyTrendChart({
  data,
  xKey,
  barKey,
  lineKey,
  barName,
  lineName,
  height = 240,
}: {
  data: Array<Record<string, any>>;
  xKey: string;
  barKey: string;
  lineKey: string;
  barName: string;
  lineName: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey={xKey} tick={{ ...AXIS, fontSize: 9 }} tickLine={false} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey={barKey} name={barName} fill="#93c5fd" radius={[2, 2, 0, 0]} />
        <Line
          dataKey={lineKey}
          name={lineName}
          stroke="#1d4ed8"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
