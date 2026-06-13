/**
 * Business-rule derivations on top of the parsed tabs. All the "locked" rules
 * live here so the pages stay thin:
 *
 *  - ASM (Team Leader) for a PA  = col 5 of the Target tab (paToAsm). Daily-lead
 *    rows whose PA isn't in that map fall to "Unassigned".
 *  - Attainment % = (daily-lead ROW COUNT for that PA/month) ÷ (Tar.Lead for
 *    that PA/month). It deliberately ignores the Target tab's own Act.Lead.
 *  - Attainment is only meaningful for months that have BOTH a Tar.Lead and
 *    real daily actuals — that derives to Jan, Feb, Apr 2026. March is excluded
 *    automatically because it only has Quali.Lead (no Tar.Lead).
 *  - NU joins to a PA via the `Contact ID` column (≈76% match); the rest are
 *    "Unassigned".
 */
import {
  type DailyLead,
  type NURecord,
  type TargetParseResult,
  type TargetRow,
  type TrainingRow,
  type MonthKey,
  normName,
  UNASSIGNED,
} from "./parse";
import { BRANDS } from "./config";

export interface PAInfo {
  name: string;
  asm: string;
  paCode: string;
  outlet: string;
}

export type BrandSplit = Record<string, number>;

export interface DashboardModel {
  daily: DailyLead[];
  target: TargetParseResult;
  nu: NURecord[];
  training: TrainingRow[];

  // ---- derived rosters ----
  pas: PAInfo[]; // union of target PAs + daily-only PAs
  asms: string[]; // distinct Team Leaders (excludes Unassigned)
  paToAsm: Record<string, string>; // normName(pa) -> asm

  // ---- derived month sets ----
  dailyMonths: MonthKey[]; // months present in daily leads (sorted)
  targetMonths: MonthKey[]; // months present in target tab (sorted)
  attainmentMonths: MonthKey[]; // months valid for attainment (Jan/Feb/Apr)

  // ---- NU join bookkeeping ----
  nuMatchRate: number; // 0–1
  nuByPa: Record<string, NURecord[]>; // key = PA name, plus UNASSIGNED bucket

  // ---- precomputed lead indexes (keyed by normName(pa)) ----
  leadByPaMonth: Map<string, Map<MonthKey, number>>;
  leadTotalByPa: Map<string, number>;
}

function sortedMonths(set: Set<MonthKey>): MonthKey[] {
  return Array.from(set)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

/** Build the full derived model from the four parsed tabs. */
export function buildModel(
  daily: DailyLead[],
  target: TargetParseResult,
  nu: NURecord[],
  training: TrainingRow[]
): DashboardModel {
  const paToAsm = target.paToAsm;

  // ---- PA roster: target PAs first, then any daily-only PAs ----
  const paMap = new Map<string, PAInfo>();
  for (const r of target.rows) {
    if (!r.paName) continue;
    const key = normName(r.paName);
    if (!paMap.has(key)) {
      paMap.set(key, {
        name: r.paName,
        asm: r.asm || UNASSIGNED,
        paCode: r.paCode,
        outlet: r.outlet,
      });
    }
  }
  for (const d of daily) {
    if (!d.paName) continue;
    const key = normName(d.paName);
    if (!paMap.has(key)) {
      paMap.set(key, {
        name: d.paName,
        asm: paToAsm[key] || UNASSIGNED,
        paCode: "",
        outlet: d.outlet,
      });
    }
  }
  const pas = Array.from(paMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // ---- month sets ----
  const dailyMonths = sortedMonths(new Set(daily.map((d) => d.month)));
  const targetMonths = target.months.slice();

  // Attainment months: target month with total Tar.Lead > 0 AND daily leads > 0.
  const dailyCountByMonth = new Map<MonthKey, number>();
  for (const d of daily) {
    if (!d.month) continue;
    dailyCountByMonth.set(d.month, (dailyCountByMonth.get(d.month) || 0) + 1);
  }
  const tarLeadByMonth = new Map<MonthKey, number>();
  for (const r of target.rows) {
    for (const [mk, cell] of Object.entries(r.months)) {
      if (cell.tarLead != null) {
        tarLeadByMonth.set(mk, (tarLeadByMonth.get(mk) || 0) + cell.tarLead);
      }
    }
  }
  const attainmentMonths = sortedMonths(
    new Set(
      targetMonths.filter(
        (mk) =>
          (tarLeadByMonth.get(mk) || 0) > 0 && (dailyCountByMonth.get(mk) || 0) > 0
      )
    )
  );

  // ---- NU join on Contact ID ----
  // Lookup from BOTH PA names and outlet names -> canonical PA name.
  const nameToPa = new Map<string, string>();
  for (const r of target.rows) {
    if (r.paName) nameToPa.set(normName(r.paName), r.paName);
    if (r.outlet && !nameToPa.has(normName(r.outlet)))
      nameToPa.set(normName(r.outlet), r.paName || r.outlet);
  }
  const nuByPa: Record<string, NURecord[]> = { [UNASSIGNED]: [] };
  let matched = 0;
  for (const rec of nu) {
    const hit = nameToPa.get(normName(rec.contactId));
    if (hit) {
      matched++;
      (nuByPa[hit] ||= []).push(rec);
    } else {
      nuByPa[UNASSIGNED].push(rec);
    }
  }
  const nuMatchRate = nu.length ? matched / nu.length : 0;

  // ---- precomputed lead indexes (single pass over the daily rows) ----
  const leadByPaMonth = new Map<string, Map<MonthKey, number>>();
  const leadTotalByPa = new Map<string, number>();
  for (const d of daily) {
    if (!d.paName) continue;
    const key = normName(d.paName);
    leadTotalByPa.set(key, (leadTotalByPa.get(key) || 0) + 1);
    if (!d.month) continue;
    let inner = leadByPaMonth.get(key);
    if (!inner) {
      inner = new Map();
      leadByPaMonth.set(key, inner);
    }
    inner.set(d.month, (inner.get(d.month) || 0) + 1);
  }

  return {
    daily,
    target,
    nu,
    training,
    pas,
    asms: target.asms,
    paToAsm,
    dailyMonths,
    targetMonths,
    attainmentMonths,
    nuMatchRate,
    nuByPa,
    leadByPaMonth,
    leadTotalByPa,
  };
}

// ----------------------------------------------------------------------------
// Selectors — pure functions over the model. Pages compose these.
// ----------------------------------------------------------------------------

export interface Filter {
  month?: MonthKey | "all";
  asm?: string | "all";
  pa?: string | "all";
}

function matchesPa(model: DashboardModel, leadPa: string, filter: Filter): boolean {
  if (filter.pa && filter.pa !== "all") {
    return normName(leadPa) === normName(filter.pa);
  }
  if (filter.asm && filter.asm !== "all") {
    return (model.paToAsm[normName(leadPa)] || UNASSIGNED) === filter.asm;
  }
  return true;
}

/** Count daily leads matching a filter. (one row = one lead) */
export function countLeads(model: DashboardModel, filter: Filter = {}): number {
  let n = 0;
  for (const d of model.daily) {
    if (filter.month && filter.month !== "all" && d.month !== filter.month) continue;
    if (!matchesPa(model, d.paName, filter)) continue;
    n++;
  }
  return n;
}

/** All daily-lead rows matching a filter (used by the BI report panels). */
export function filteredDaily(model: DashboardModel, filter: Filter = {}): DailyLead[] {
  const out: DailyLead[] = [];
  for (const d of model.daily) {
    if (filter.month && filter.month !== "all" && d.month !== filter.month) continue;
    if (!matchesPa(model, d.paName, filter)) continue;
    out.push(d);
  }
  return out;
}

/** Sum of Tar.Lead for a month, scoped to a PA/ASM filter. */
export function tarLeadForScopeMonth(
  model: DashboardModel,
  filter: Filter,
  month: MonthKey
): number {
  let t = 0;
  for (const r of model.target.rows) {
    if (filter.pa && filter.pa !== "all" && normName(r.paName) !== normName(filter.pa))
      continue;
    if (filter.asm && filter.asm !== "all" && r.asm !== filter.asm) continue;
    const cell = r.months[month];
    if (cell && cell.tarLead != null) t += cell.tarLead;
  }
  return t;
}

/** Daily leads for a specific PA + month (row count). */
export function leadsForPaMonth(
  model: DashboardModel,
  paName: string,
  month: MonthKey
): number {
  return model.leadByPaMonth.get(normName(paName))?.get(month) || 0;
}

/** Total daily leads for a PA across all months. */
export function leadsForPa(model: DashboardModel, paName: string): number {
  return model.leadTotalByPa.get(normName(paName)) || 0;
}

/** Sum of Tar.Lead for a PA across its target rows for a month. */
export function tarLeadForPaMonth(
  model: DashboardModel,
  paName: string,
  month: MonthKey
): number {
  const key = normName(paName);
  let t = 0;
  let found = false;
  for (const r of model.target.rows) {
    if (normName(r.paName) !== key) continue;
    const cell = r.months[month];
    if (cell && cell.tarLead != null) {
      t += cell.tarLead;
      found = true;
    }
  }
  return found ? t : 0;
}

/** Attainment % for a PA/month, or null if no target (e.g. March). */
export function attainmentPct(
  model: DashboardModel,
  paName: string,
  month: MonthKey
): number | null {
  const target = tarLeadForPaMonth(model, paName, month);
  if (target <= 0) return null;
  const actual = leadsForPaMonth(model, paName, month);
  return (actual / target) * 100;
}

/** Combined attainment over the valid attainment months for a PA. */
export function attainmentOverMonths(
  model: DashboardModel,
  paName: string,
  months: MonthKey[]
): number | null {
  let target = 0;
  let actual = 0;
  for (const m of months) {
    const t = tarLeadForPaMonth(model, paName, m);
    if (t <= 0) continue;
    target += t;
    actual += leadsForPaMonth(model, paName, m);
  }
  return target > 0 ? (actual / target) * 100 : null;
}

/** NU count (optionally split by brand) for a PA. */
export function nuForPa(model: DashboardModel, paName: string): {
  total: number;
  byBrand: BrandSplit;
} {
  const recs = model.nuByPa[paName] || [];
  return summarizeNU(recs);
}

export function summarizeNU(recs: NURecord[]): { total: number; byBrand: BrandSplit } {
  const byBrand: BrandSplit = {};
  for (const b of BRANDS) byBrand[b] = 0;
  for (const r of recs) {
    byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  }
  return { total: recs.length, byBrand };
}

/** NU records matching an ASM/PA/month filter (uses the Contact-ID join). */
export function filteredNU(model: DashboardModel, filter: Filter = {}): NURecord[] {
  const out: NURecord[] = [];
  for (const [pa, recs] of Object.entries(model.nuByPa)) {
    if (filter.pa && filter.pa !== "all" && normName(pa) !== normName(filter.pa))
      continue;
    if (filter.asm && filter.asm !== "all") {
      const asm = pa === UNASSIGNED ? UNASSIGNED : model.paToAsm[normName(pa)] || UNASSIGNED;
      if (asm !== filter.asm) continue;
    }
    for (const r of recs) {
      if (filter.month && filter.month !== "all" && r.month !== filter.month) continue;
      out.push(r);
    }
  }
  return out;
}

/** All PAs for an ASM (Team Leader). */
export function pasForAsm(model: DashboardModel, asm: string): PAInfo[] {
  return model.pas.filter((p) => p.asm === asm);
}

/** ASM for a PA, defaulting to Unassigned. */
export function asmForPa(model: DashboardModel, paName: string): string {
  return model.paToAsm[normName(paName)] || UNASSIGNED;
}

/** Target-weighted combined attainment for a whole team over given months. */
export function teamAttainment(
  model: DashboardModel,
  asm: string,
  months: MonthKey[]
): number | null {
  let target = 0;
  let actual = 0;
  for (const p of pasForAsm(model, asm)) {
    for (const m of months) {
      const t = tarLeadForPaMonth(model, p.name, m);
      if (t <= 0) continue;
      target += t;
      actual += leadsForPaMonth(model, p.name, m);
    }
  }
  return target > 0 ? (actual / target) * 100 : null;
}

/** Overall (all-team) target-weighted attainment for one month. */
export function overallAttainmentForMonth(
  model: DashboardModel,
  month: MonthKey
): number | null {
  let target = 0;
  let actual = 0;
  for (const p of model.pas) {
    const t = tarLeadForPaMonth(model, p.name, month);
    if (t <= 0) continue;
    target += t;
    actual += leadsForPaMonth(model, p.name, month);
  }
  return target > 0 ? (actual / target) * 100 : null;
}

/** Total daily leads per month (across everyone). */
export function leadsByMonth(model: DashboardModel): Map<MonthKey, number> {
  const m = new Map<MonthKey, number>();
  for (const d of model.daily) {
    if (!d.month) continue;
    m.set(d.month, (m.get(d.month) || 0) + 1);
  }
  return m;
}

export interface ASMRollup {
  asm: string;
  paCount: number;
  leads: number;
  nuTotal: number;
  attainment: number | null;
}

/** One rollup row per Team Leader (plus Unassigned if it carries any data). */
export function buildASMRollups(model: DashboardModel): ASMRollup[] {
  const groups = [...model.asms];
  if (model.pas.some((p) => p.asm === UNASSIGNED)) groups.push(UNASSIGNED);

  return groups
    .map((asm) => {
      const pas = pasForAsm(model, asm);
      let leads = 0;
      let nuTotal = 0;
      for (const p of pas) {
        leads += leadsForPa(model, p.name);
        nuTotal += nuForPa(model, p.name).total;
      }
      return {
        asm,
        paCount: pas.length,
        leads,
        nuTotal,
        attainment: teamAttainment(model, asm, model.attainmentMonths),
      };
    })
    .sort((a, b) => b.leads - a.leads);
}

/** One summarized row per PA — shared by Overview and Leaderboard. */
export interface PASummary {
  name: string;
  asm: string;
  outlet: string;
  leads: number;
  attainment: number | null; // combined over attainmentMonths
  nuTotal: number;
  nuByBrand: BrandSplit;
}

export function buildPASummaries(model: DashboardModel): PASummary[] {
  return model.pas
    .map((p) => {
      const nu = nuForPa(model, p.name);
      return {
        name: p.name,
        asm: p.asm,
        outlet: p.outlet,
        leads: leadsForPa(model, p.name),
        attainment: attainmentOverMonths(model, p.name, model.attainmentMonths),
        nuTotal: nu.total,
        nuByBrand: nu.byBrand,
      };
    })
    .sort((a, b) => b.leads - a.leads);
}

// ---- small color/threshold helper shared by pills & charts ----
export type AttainmentStatus = "green" | "amber" | "red" | "none";
export function attainmentStatus(pct: number | null): AttainmentStatus {
  if (pct == null) return "none";
  if (pct >= 100) return "green";
  if (pct >= 70) return "amber";
  return "red";
}
