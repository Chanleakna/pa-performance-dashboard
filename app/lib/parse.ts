/**
 * All CSV parsing for the four Google Sheet tabs lives here.
 *
 * The trickiest part is the Target & Actual tab: a WIDE cross-tab with a
 * TWO-ROW header. We never assume fixed column offsets for the month blocks —
 * we scan the row-1 sub-headers under each (forward-filled) row-0 month label.
 * This makes the parser resilient to the known March quirk (March has
 * `Quali.Lead` instead of `Tar.Lead`; April has both `Act.Lead` and
 * `Quali.Lead`) and to extra/blank rows or columns.
 */
import Papa from "papaparse";

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

/** YYYY-MM month key, e.g. "2026-01". */
export type MonthKey = string;

export function monthKeyFromDate(d: Date): MonthKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Human label for a month key, e.g. "Jan 2026". */
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export function monthLabel(key: MonthKey): string {
  const [y, m] = key.split("-");
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11 || !y) return key;
  return `${MONTH_NAMES[idx]} ${y}`;
}

/**
 * Parse a DAY-FIRST date such as "25/01/2026" or "25/01/2026 14:30".
 * Also tolerates ISO ("2026-01-25") and a few common separators.
 * Returns null if it can't make sense of the value.
 */
export function parseDayFirst(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO-ish: 2026-01-25 (optionally with time) — month is in the middle.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  // Day-first with / . or - separators: 25/01/2026, 25.01.2026, 25-01-2026
  const dmy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const day = Number(dmy[1]);
    const mon = Number(dmy[2]);
    const d = new Date(year, mon - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // Last resort: let the engine try (covers "Jan 25, 2026" etc.).
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

const MONTH_ABBR = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * Month key from a header cell. Handles ISO ("2026-03-26"), day-first
 * ("26/03/2026"), and month-name forms ("Mar 2026", "Mar-26", "March 2026").
 */
function monthKeyFromHeaderCell(raw: string): MonthKey | null {
  const d = parseDayFirst(raw);
  if (d) return monthKeyFromDate(d);
  const m = raw
    .toLowerCase()
    .match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/]*['"]?(\d{2,4})/);
  if (m) {
    const idx = MONTH_ABBR.indexOf(m[1]);
    let y = Number(m[2]);
    if (y < 100) y += 2000;
    if (idx >= 0) return `${y}-${String(idx + 1).padStart(2, "0")}`;
  }
  return null;
}

/** Parse a number that may contain commas, %, spaces, or be blank. */
export function num(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/[, %]/g, "");
  if (s === "" || s === "-" || s === "—") return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/** Normalize a name for fuzzy joining: lowercase, collapse whitespace. */
export function normName(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function yesish(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

const UNASSIGNED = "Unassigned";
export { UNASSIGNED };

// ----------------------------------------------------------------------------
// Tab 1 — Total Daily Lead (one row = one lead)
// ----------------------------------------------------------------------------

export interface DailyLead {
  month: MonthKey; // derived from Created At, fallback to the Month column
  createdAt: Date | null;
  product: string;
  outlet: string; // "Full Name"
  paName: string;
  department: string;
  activity: string;
  newUser: boolean;
  sku: string;
}

function pick(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    // case-insensitive header match
    const hit = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === n.toLowerCase()
    );
    if (hit && row[hit] != null && String(row[hit]).trim() !== "") {
      return String(row[hit]).trim();
    }
  }
  return "";
}

export function parseDailyLeads(csv: string): DailyLead[] {
  const { data } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });

  const out: DailyLead[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const createdRaw = pick(row, "Created At", "Created", "Date");
    const createdAt = parseDayFirst(createdRaw);
    const monthCol = pick(row, "Month");
    // Prefer the real date; fall back to the Month column if present.
    const month =
      (createdAt && monthKeyFromDate(createdAt)) ||
      monthKeyFromHeaderCell(monthCol) ||
      "";

    const paName = pick(row, "PA Name", "PA");
    const outlet = pick(row, "Full Name", "Outlet", "Outlet Name");

    // Skip totally empty rows.
    if (!month && !paName && !outlet) continue;

    out.push({
      month,
      createdAt,
      product: pick(row, "Product"),
      outlet,
      paName,
      department: pick(row, "Department"),
      activity: pick(row, "Activity"),
      newUser: yesish(pick(row, "New User", "NewUser")),
      sku: pick(row, "SKU"),
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Tab 2 — Target & Actual of Lead & NU (WIDE, 2-row header)
// ----------------------------------------------------------------------------

export interface MonthCell {
  tarLead: number | null;
  actLead: number | null;
  qualiLead: number | null; // March (and April) replacement/extra for Tar.Lead
  tarNU: number | null;
  actNU: number | null;
}

export interface TargetRow {
  no: string;
  code: string;
  outlet: string; // Outlet Name
  paCode: string;
  paName: string; // col 4
  asm: string; // col 5 — "Change New Update" = the ASM / Team Leader
  months: Record<MonthKey, MonthCell>;
}

type CellField = keyof MonthCell;

/** Classify a row-1 sub-header into one of the 5 metric fields, or null. */
function classifySubHeader(raw: string): CellField | null {
  const s = raw.toLowerCase().replace(/[^a-z]/g, ""); // drop dots/spaces
  const hasLead = s.includes("lead");
  const hasNU = s.includes("nu");
  if (s.includes("quali") && hasLead) return "qualiLead";
  if (s.includes("tar") && hasLead) return "tarLead";
  if (s.includes("act") && hasLead) return "actLead";
  if (s.includes("tar") && hasNU) return "tarNU";
  if (s.includes("act") && hasNU) return "actNU";
  return null;
}

function emptyCell(): MonthCell {
  return { tarLead: null, actLead: null, qualiLead: null, tarNU: null, actNU: null };
}

export interface TargetParseResult {
  rows: TargetRow[];
  /** Distinct month keys discovered in the header, in order. */
  months: MonthKey[];
  /** PA name -> ASM (Team Leader). */
  paToAsm: Record<string, string>;
  /** Distinct ASMs, sorted. */
  asms: string[];
  /** Diagnostics for remote debugging of the wide-header parse. */
  debug?: {
    totalCsvRows: number;
    monthRowIdx: number;
    monthStart: number;
    headerMonthsSample: string[];
    headerSubsSample: string[];
    sampleDataRow: string[];
    mappedCols: number;
    tarLeadCols: number;
  };
}

export function parseTargetActual(csv: string): TargetParseResult {
  const { data } = Papa.parse<string[]>(csv, {
    header: false,
    skipEmptyLines: false,
  });

  const rows2d = (data as string[][]).filter(Array.isArray);
  if (rows2d.length < 3) {
    return { rows: [], months: [], paToAsm: {}, asms: [] };
  }

  // A cell that clearly reads as a calendar date (used to find the month row).
  const looksLikeDate = (raw: string): boolean =>
    /\d{4}-\d{1,2}-\d{1,2}/.test(raw) ||
    /\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/.test(raw) ||
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/]*['"]?\d{2,4}/i.test(raw);

  // AUTO-DETECT the 2-row header instead of assuming rows 0/1: a sheet may have
  // a title/blank row on top. The "month row" is whichever of the first few
  // rows has the most date-like cells; the sub-header row is the next one.
  let monthRowIdx = 0;
  let bestDateCount = -1;
  for (let i = 0; i < Math.min(8, rows2d.length - 1); i++) {
    const count = rows2d[i].reduce(
      (acc, cell) => acc + (looksLikeDate(String(cell ?? "").trim()) ? 1 : 0),
      0
    );
    if (count > bestDateCount) {
      bestDateCount = count;
      monthRowIdx = i;
    }
  }
  const headerMonths = rows2d[monthRowIdx]; // merged month dates (sparse)
  const headerSubs = rows2d[monthRowIdx + 1] || []; // repeating sub-headers
  const bodyRows = rows2d.slice(monthRowIdx + 2);

  // Month blocks start at the first column of the month row that holds a date
  // (the identity columns sit to its left). Fall back to the documented 6.
  let monthStart = headerMonths.findIndex((c) =>
    looksLikeDate(String(c ?? "").trim())
  );
  if (monthStart < 0) monthStart = 6;

  // Build a column map by scanning sub-headers under the forward-filled month.
  interface ColMap {
    col: number;
    month: MonthKey;
    field: CellField;
  }
  const colMaps: ColMap[] = [];
  const monthOrder: MonthKey[] = [];
  let currentMonth: MonthKey | null = null;

  const width = Math.max(headerMonths.length, headerSubs.length);
  for (let c = monthStart; c < width; c++) {
    const monthCellRaw = (headerMonths[c] ?? "").trim();
    if (monthCellRaw) {
      const mk = monthKeyFromHeaderCell(monthCellRaw);
      if (mk) {
        currentMonth = mk;
        if (!monthOrder.includes(mk)) monthOrder.push(mk);
      }
    }
    const field = classifySubHeader((headerSubs[c] ?? "").trim());
    if (currentMonth && field) {
      colMaps.push({ col: c, month: currentMonth, field });
    }
  }

  const rows: TargetRow[] = [];
  const paToAsm: Record<string, string> = {};
  const asmSet = new Set<string>();

  for (const r of bodyRows) {
    const paName = (r[4] ?? "").trim();
    const outlet = (r[2] ?? "").trim();
    const asm = (r[5] ?? "").trim();

    // Skip blank/footer rows that have no PA and no outlet.
    if (!paName && !outlet) continue;

    const months: Record<MonthKey, MonthCell> = {};
    for (const cm of colMaps) {
      if (!months[cm.month]) months[cm.month] = emptyCell();
      const v = num(r[cm.col]);
      if (v !== null) months[cm.month][cm.field] = v;
    }

    rows.push({
      no: (r[0] ?? "").trim(),
      code: (r[1] ?? "").trim(),
      outlet,
      paCode: (r[3] ?? "").trim(),
      paName,
      asm: asm || UNASSIGNED,
      months,
    });

    if (paName) {
      paToAsm[normName(paName)] = asm || UNASSIGNED;
      if (asm) asmSet.add(asm);
    }
  }

  return {
    rows,
    months: monthOrder,
    paToAsm,
    asms: Array.from(asmSet).sort((a, b) => a.localeCompare(b)),
    debug: {
      totalCsvRows: rows2d.length,
      monthRowIdx,
      monthStart,
      headerMonthsSample: headerMonths.slice(0, 18).map((c) => String(c ?? "")),
      headerSubsSample: headerSubs.slice(0, 18).map((c) => String(c ?? "")),
      sampleDataRow: (bodyRows[0] ?? []).slice(0, 18).map((c) => String(c ?? "")),
      mappedCols: colMaps.length,
      tarLeadCols: colMaps.filter((c) => c.field === "tarLead").length,
    },
  };
}

// ----------------------------------------------------------------------------
// Tab 3 — Total Final NU (one row = one recruit; Contact ID = PA/outlet name)
// ----------------------------------------------------------------------------

export interface NURecord {
  month: MonthKey;
  date: Date | null; // from "Last call time", for the daily NU trend
  contactId: string; // holds the PA / outlet name
  brand: string; // normalized Source brand
  callOutcome: string;
  campaign: string;
}

/** Normalize a free-text brand into one of our canonical Abbott brands. */
function normalizeBrand(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("similac")) return "Similac";
  if (s.includes("ensure")) return "Ensure";
  if (s.includes("glucerna")) return "Glucerna";
  if (s.includes("pediasure") || s.includes("pedia")) return "Pediasure";
  return raw.trim() || "Other";
}

export function parseFinalNU(csv: string): NURecord[] {
  const { data } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });

  const out: NURecord[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const contactId = pick(row, "Contact ID", "ContactID", "Contact");
    const monthCol = pick(row, "Month");
    const lastCall = pick(row, "Last call time", "Last Call Time");
    const date = parseDayFirst(lastCall);
    const month =
      monthKeyFromHeaderCell(monthCol) ||
      (date && monthKeyFromDate(date)) ||
      "";

    if (!contactId && !month) continue;

    out.push({
      month,
      date,
      contactId,
      brand: normalizeBrand(pick(row, "Source brand", "Source Brand", "Brand")),
      callOutcome: pick(row, "Call Outcome"),
      campaign: pick(row, "Campaign"),
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Tab 4 — Training Result (Name column is EMPTY — team/topic level only)
// ----------------------------------------------------------------------------

export interface TrainingRow {
  month: MonthKey;
  brandTopic: string;
  totalPoints: number | null;
  pctAchieve: number | null; // 0–100
}

export function parseTraining(csv: string): TrainingRow[] {
  const { data } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });

  const out: TrainingRow[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const monthCol = pick(row, "Month");
    const start = pick(row, "Start time", "Start Time");
    const month =
      monthKeyFromHeaderCell(monthCol) ||
      (parseDayFirst(start) && monthKeyFromDate(parseDayFirst(start)!)) ||
      "";
    const brandTopic = pick(row, "Brand Topic", "Brand/Topic", "Topic");
    if (!brandTopic && !month) continue;

    let pct = num(pick(row, "% Achieve", "%Achieve", "Achieve"));
    // If stored as a fraction (0–1), scale to a percentage.
    if (pct !== null && pct > 0 && pct <= 1) pct = pct * 100;

    out.push({
      month,
      brandTopic,
      totalPoints: num(pick(row, "Total points", "Total Points", "Points")),
      pctAchieve: pct,
    });
  }
  return out;
}
