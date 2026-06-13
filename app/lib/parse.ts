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
 * Month key from a header cell — STRICT parsing only. Handles ISO
 * ("2026-03-26"), month-name ("Mar 2026", "Mar-26", "March '26"), and numeric
 * d/m/y or m/y forms. Deliberately does NOT fall back to `new Date()` because
 * the engine misreads things like "Jan-26" as 26 Jan 2001, which would scatter
 * months across bogus years (e.g. 2000/2001).
 */
/** The month key immediately before a given one ("2026-02" -> "2026-01"). */
function prevMonthKey(key: MonthKey): MonthKey {
  const [y, m] = key.split("-").map(Number);
  return monthKeyFromDate(new Date(y, m - 2, 1)); // m is 1-based; m-2 = prev month
}

function monthKeyFromHeaderCell(raw: string): MonthKey | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const mk = (year: number, month: number): MonthKey | null =>
    month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, "0")}` : null;
  const fullYear = (y: number) => (y < 100 ? y + 2000 : y);

  // ISO: 2026-01 or 2026-01-26
  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (iso) return mk(Number(iso[1]), Number(iso[2]));

  // Month name + year: "Jan-26", "Jan 2026", "January '26", "Sept-26"
  const mn = s
    .toLowerCase()
    .match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/.]*['"]?(\d{2,4})/);
  if (mn) {
    const idx = MONTH_ABBR.indexOf(mn[1]);
    if (idx >= 0) return mk(fullYear(Number(mn[2])), idx + 1);
  }

  // Day-first numeric with full separators: 26/01/2026, 26-01-26
  const dmy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (dmy) return mk(fullYear(Number(dmy[3])), Number(dmy[2]));

  // Month/Year only: "01/2026", "1/26"
  const my = s.match(/^(\d{1,2})[\/.\-](\d{2,4})$/);
  if (my) return mk(fullYear(Number(my[2])), Number(my[1]));

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
    combinedHeaderSample: string[];
    headerRowCount: number;
    dataStartRow: number;
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
  const width = rows2d.reduce((w, r) => Math.max(w, r.length), 0);

  // Metric blocks begin at the first column whose header reads as a metric
  // (Tar.Lead/Act.Lead/…). This is more reliable than the first DATE column,
  // because the FIRST month's date label is sometimes blank/merged-away in the
  // CSV export (e.g. January), which would otherwise skip that whole block.
  const candidateSub = rows2d[monthRowIdx + 1] || [];
  let monthStart = -1;
  for (let c = 0; c < width; c++) {
    const combo = `${String(headerMonths[c] ?? "")} ${String(candidateSub[c] ?? "")}`;
    if (classifySubHeader(combo)) {
      monthStart = c;
      break;
    }
  }
  if (monthStart < 0)
    monthStart = headerMonths.findIndex((c) => looksLikeDate(String(c ?? "").trim()));
  if (monthStart < 0) monthStart = 6;

  // Where does the DATA begin? Header rows are label rows; a data row has
  // several numeric cells in the month region. Walk down until we hit one.
  const numericCountInMonthRegion = (row: string[]): number => {
    let n = 0;
    for (let c = monthStart; c < width; c++) if (num(row[c]) !== null) n++;
    return n;
  };
  let dataStart = monthRowIdx + 1;
  while (
    dataStart < rows2d.length &&
    numericCountInMonthRegion(rows2d[dataStart]) < 2
  ) {
    dataStart++;
  }
  if (dataStart >= rows2d.length) dataStart = monthRowIdx + 2; // safety

  // All header rows (could be 1, 2, or 3: month / group / metric), each
  // forward-filled across the month region to spread merged labels.
  const headerRows = rows2d.slice(monthRowIdx, dataStart);
  const filled = headerRows.map((row) => {
    const out: string[] = [];
    let last = "";
    for (let c = 0; c < width; c++) {
      const v = String(row[c] ?? "").trim();
      if (c < monthStart) {
        out[c] = v;
        last = "";
        continue;
      }
      if (v) last = v;
      out[c] = last; // forward-fill merged cells within the month region
    }
    return out;
  });
  const headerSubs = headerRows[headerRows.length - 1] || []; // for diagnostics
  const bodyRows = rows2d.slice(dataStart);

  // Column map: month forward-filled from the date row; the metric field read
  // from the COMBINED text of every header row (handles "Lead"+"Tar" split
  // across two label rows, or a single combined "Jan-26 Tar.Lead" cell).
  interface ColMap {
    col: number;
    month: MonthKey;
    field: CellField;
  }
  const colMaps: ColMap[] = [];
  const monthOrder: MonthKey[] = [];
  let currentMonth: MonthKey | null = null;

  // If metric columns appear BEFORE the first dated month header, the leading
  // block is an unlabeled month (commonly January). Back-fill it as the month
  // immediately before the first dated month so it isn't dropped.
  let firstDatedCol = -1;
  let firstDatedMonth: MonthKey | null = null;
  for (let c = monthStart; c < width; c++) {
    const mk = monthKeyFromHeaderCell(String(headerMonths[c] ?? "").trim());
    if (mk) {
      firstDatedCol = c;
      firstDatedMonth = mk;
      break;
    }
  }
  if (firstDatedMonth && firstDatedCol > monthStart) {
    currentMonth = prevMonthKey(firstDatedMonth);
    monthOrder.push(currentMonth);
  }

  for (let c = monthStart; c < width; c++) {
    const monthCellRaw = String(headerMonths[c] ?? "").trim();
    if (monthCellRaw) {
      const mk = monthKeyFromHeaderCell(monthCellRaw);
      if (mk) {
        currentMonth = mk;
        if (!monthOrder.includes(mk)) monthOrder.push(mk);
      }
    }
    const combined = filled.map((f) => f[c]).join(" ");
    const field = classifySubHeader(combined);
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
      combinedHeaderSample: filled.length
        ? Array.from({ length: Math.min(18, width) }, (_, c) =>
            filled.map((f) => f[c]).join("|")
          ).slice(monthStart, monthStart + 12)
        : [],
      headerRowCount: headerRows.length,
      dataStartRow: dataStart,
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

// ----------------------------------------------------------------------------
// Tab 5 — Daily Sales (second spreadsheet, "export" tab)
// Holds a Customer Code column + a total-actual-sales column. We sum actual
// sales per Customer Code, then join to the Target tab's `Code` elsewhere.
// ----------------------------------------------------------------------------

export interface SalesParseResult {
  /** normalized customer code -> total actual sales (all months) */
  byCode: Record<string, number>;
  /** normalized customer code -> { monthKey -> actual sales } */
  byCodeMonth: Record<string, Record<MonthKey, number>>;
  total: number;
  /** distinct month keys present in the sales data, sorted */
  months: MonthKey[];
  debug?: {
    rows: number;
    headers: string[];
    codeHeader: string;
    salesHeader: string;
    yearHeader: string;
    monthHeader: string;
    distinctCodes: number;
  };
}

/** Normalize a customer/outlet code for joining (trim + lowercase). */
export function normCode(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function parseSales(csv: string): SalesParseResult {
  const { data, meta } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const headers = (meta.fields || []).map((h) => String(h));
  const lc = (h: string) => h.toLowerCase();
  const find = (...tests: ((h: string) => boolean)[]): string => {
    for (const t of tests) {
      const hit = headers.find((h) => t(lc(h)));
      if (hit) return hit;
    }
    return "";
  };

  // Customer code — must NOT match "Material Code". Note the header may read
  // "Customer Cod" (truncated), so match "cod" rather than the full "code".
  const codeHeader = find(
    (h) => h.includes("customer") && h.includes("cod"),
    (h) => h.includes("outlet") && h.includes("cod"),
    (h) => h === "code" || h.includes("customer code")
  );
  const salesHeader = find(
    (h) => h.includes("total") && h.includes("sale"),
    (h) => h.includes("act") && h.includes("sale"),
    (h) => h.includes("sale")
  );
  const yearHeader = find((h) => h.includes("year"));

  // Month column: its values are month names ("May", "January", …). Detect by
  // sampling, ignoring the year/code/sales columns. (Header is "Short Cut".)
  let monthHeader = "";
  {
    let best = 0;
    for (const h of headers) {
      if (h === yearHeader || h === codeHeader || h === salesHeader) continue;
      let c = 0;
      const n = Math.min(40, data.length);
      for (let i = 0; i < n; i++) {
        const v = String(data[i]?.[h] ?? "").trim().toLowerCase();
        if (v && MONTH_ABBR.some((mn) => v.startsWith(mn))) c++;
      }
      if (c > best) {
        best = c;
        monthHeader = h;
      }
    }
  }

  const byCode: Record<string, number> = {};
  const byCodeMonth: Record<string, Record<MonthKey, number>> = {};
  const monthsSet = new Set<MonthKey>();
  let total = 0;
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const code = normCode(row[codeHeader]);
    const val = num(row[salesHeader]);
    if (!code || val == null) continue;
    byCode[code] = (byCode[code] || 0) + val;
    total += val;

    if (monthHeader) {
      const yr = yearHeader ? String(row[yearHeader] ?? "").trim() : "";
      const mk = monthKeyFromHeaderCell(`${row[monthHeader]} ${yr}`.trim());
      if (mk) {
        (byCodeMonth[code] ||= {})[mk] = (byCodeMonth[code][mk] || 0) + val;
        monthsSet.add(mk);
      }
    }
  }

  return {
    byCode,
    byCodeMonth,
    total,
    months: Array.from(monthsSet).sort(),
    debug: {
      rows: data.length,
      headers,
      codeHeader,
      salesHeader,
      yearHeader,
      monthHeader,
      distinctCodes: Object.keys(byCode).length,
    },
  };
}

// ----------------------------------------------------------------------------
// Tab 6 — Sales Target ("Only Target" tab of the Total Trade Investment book)
// Wide cross-tab: ID columns (No, Cust Code, Customer Name, Type, …) then one
// column per month (Jan-26 … Dec-26) + Total. Title/legend rows sit on top.
// ----------------------------------------------------------------------------

export interface SalesTargetParseResult {
  /** normalized customer code -> { monthKey -> sales target } */
  byCodeMonth: Record<string, Record<MonthKey, number>>;
  /** normalized customer code -> total sales target (across the month cols) */
  byCode: Record<string, number>;
  months: MonthKey[];
  total: number;
  debug?: {
    rows: number;
    headerRowIdx: number;
    codeCol: number;
    monthCols: number;
    distinctCodes: number;
    headerSample: string[];
  };
}

export function parseSalesTarget(csv: string): SalesTargetParseResult {
  const { data } = Papa.parse<string[]>(csv, {
    header: false,
    skipEmptyLines: false,
  });
  const rows2d = (data as string[][]).filter(Array.isArray);
  const empty: SalesTargetParseResult = {
    byCodeMonth: {},
    byCode: {},
    months: [],
    total: 0,
  };
  if (rows2d.length < 2) return empty;

  const looksLikeMonth = (raw: string) => monthKeyFromHeaderCell(raw) != null;

  // Header row = the one (within the first ~8) with the most month-like cells.
  let headerRowIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(8, rows2d.length - 1); i++) {
    const c = rows2d[i].reduce(
      (acc, cell) => acc + (looksLikeMonth(String(cell ?? "").trim()) ? 1 : 0),
      0
    );
    if (c > best) {
      best = c;
      headerRowIdx = i;
    }
  }
  const header = rows2d[headerRowIdx];
  const width = rows2d.reduce((w, r) => Math.max(w, r.length), 0);

  // Customer code column (NOT material/other code) + month columns.
  let codeCol = header.findIndex((h) => {
    const s = String(h ?? "").toLowerCase();
    return s.includes("cust") && s.includes("cod");
  });
  if (codeCol < 0)
    codeCol = header.findIndex((h) => String(h ?? "").toLowerCase().includes("code"));
  if (codeCol < 0) codeCol = 1;

  const monthCols: { col: number; mk: MonthKey }[] = [];
  for (let c = 0; c < width; c++) {
    const mk = monthKeyFromHeaderCell(String(header[c] ?? "").trim());
    if (mk) monthCols.push({ col: c, mk });
  }

  // The sales target is VAT-inclusive (10%); show it ex-VAT so it compares
  // apples-to-apples with actual sales (which are ex-VAT).
  const EX_VAT = 0.9;

  const byCodeMonth: Record<string, Record<MonthKey, number>> = {};
  const byCode: Record<string, number> = {};
  const monthsSet = new Set<MonthKey>();
  let total = 0;
  for (const r of rows2d.slice(headerRowIdx + 1)) {
    const code = normCode(r[codeCol]);
    if (!code) continue;
    for (const mc of monthCols) {
      const raw = num(r[mc.col]);
      if (raw == null) continue;
      const v = raw * EX_VAT;
      (byCodeMonth[code] ||= {})[mc.mk] = (byCodeMonth[code][mc.mk] || 0) + v;
      byCode[code] = (byCode[code] || 0) + v;
      total += v;
      monthsSet.add(mc.mk);
    }
  }

  return {
    byCodeMonth,
    byCode,
    months: Array.from(monthsSet).sort(),
    total,
    debug: {
      rows: rows2d.length,
      headerRowIdx,
      codeCol,
      monthCols: monthCols.length,
      distinctCodes: Object.keys(byCode).length,
      headerSample: header.slice(0, 20).map((c) => String(c ?? "")),
    },
  };
}
