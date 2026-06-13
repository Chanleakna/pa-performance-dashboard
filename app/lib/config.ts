/**
 * Central configuration for the live Google Sheets data source.
 *
 * Every value here is overridable at deploy time via NEXT_PUBLIC_* env vars,
 * so the published-CSV gids can be swapped in Vercel without a code change.
 *
 * HOW THE DATA FLOWS:
 *   Google Sheet (Publish to web -> CSV)  ->  app/api/sheet route (no-store proxy)
 *     ->  SWR client fetch (refreshInterval)  ->  PapaParse  ->  parse.ts
 *
 * To point at a different spreadsheet, change SHEET_PUB_BASE; to point at
 * different tabs, change the gids below (or set the env overrides in Vercel).
 */

/**
 * Base of the "Publish to web" CSV export URL, WITHOUT the trailing
 * `&gid=<GID>`. This is the part between `/d/e/` ... `/pub?output=csv`.
 * Override with NEXT_PUBLIC_SHEET_PUB_BASE.
 */
export const SHEET_PUB_BASE =
  process.env.NEXT_PUBLIC_SHEET_PUB_BASE ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRvNutmlfjDp43_K6CAn8N5qJZQBfmvOS-PRhtS4gq9B0pnB21JN8duePeWvWNa5E-9jHuKd0FWu7oY/pub?output=csv";

/**
 * Base of the SECOND spreadsheet — the Daily Sales workbook (its "export" tab
 * holds Customer Code + total actual sales). Override with
 * NEXT_PUBLIC_SALES_PUB_BASE.
 */
export const SALES_PUB_BASE =
  process.env.NEXT_PUBLIC_SALES_PUB_BASE ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2V_bt97RtNN75BmIEPrzsfy48ifx3oIysMB5Pl_F0Jj_6Zwe6OsG6p-oAj0XPseVnVY-k6oC9l98o/pub?output=csv";

/**
 * Base of the THIRD spreadsheet — Total Trade Investment, "Only Target" tab:
 * the sales TARGET per Customer Code per month. Override with
 * NEXT_PUBLIC_SALES_TARGET_PUB_BASE.
 */
export const SALES_TARGET_PUB_BASE =
  process.env.NEXT_PUBLIC_SALES_TARGET_PUB_BASE ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQFKgLVfhDBzGz2TBUqC3ZuO91mt0Nbromj9-kfDiuGpxL3lJHgX7xwax1KlxK8HyjMuW0WtneioUqX/pub?output=csv";

/** The tabs we read. `key` is what the client/api use to address a tab. */
export type SheetKey =
  | "daily"
  | "target"
  | "nu"
  | "training"
  | "sales"
  | "salesTarget";

export interface SheetTabConfig {
  key: SheetKey;
  /** Human label for the tab (matches the Google Sheet tab name). */
  label: string;
  /** Published-to-web gid. Override per env var. */
  gid: string;
  /** Which spreadsheet this tab lives in (defaults to SHEET_PUB_BASE). */
  base?: string;
}

export const SHEET_TABS: Record<SheetKey, SheetTabConfig> = {
  // Total Daily Lead — ONE ROW = ONE LEAD. ~25,214 rows. Spans Dec 2025–Dec 2026.
  daily: {
    key: "daily",
    label: "Total Daily Lead",
    gid: process.env.NEXT_PUBLIC_SHEET_DAILY_GID || "0",
  },
  // Target & Actual of Lead & NU — WIDE 2-ROW-HEADER cross-tab. 117 outlet rows.
  target: {
    key: "target",
    label: "Target & Actual of Lead & NU",
    gid: process.env.NEXT_PUBLIC_SHEET_TARGET_GID || "1170729989",
  },
  // Total Final NU — one row = one recruit. ~4,935 rows. Contact ID = PA/outlet name.
  nu: {
    key: "nu",
    label: "Total Final NU",
    gid: process.env.NEXT_PUBLIC_SHEET_NU_GID || "1699661674",
  },
  // Training Result — 422 rows, ~98% avg. Name column is EMPTY (team/topic-level only).
  training: {
    key: "training",
    label: "Training Result",
    gid: process.env.NEXT_PUBLIC_SHEET_TRAINING_GID || "1990560513",
  },
  // Daily Sales — the "export" tab of the SECOND spreadsheet. Holds Customer
  // Code + total actual sales. NOTE: default gid is a guess (first sheet);
  // set NEXT_PUBLIC_SALES_GID to the real "export" tab gid.
  sales: {
    key: "sales",
    label: "Daily Sales (export)",
    gid: process.env.NEXT_PUBLIC_SALES_GID || "0",
    base: SALES_PUB_BASE,
  },
  // Sales Target — the "Only Target" tab of the Total Trade Investment book.
  // Wide cross-tab: Cust Code + monthly sales targets. gid 897956136.
  salesTarget: {
    key: "salesTarget",
    label: "Sales Target (Only Target)",
    gid: process.env.NEXT_PUBLIC_SALES_TARGET_GID || "897956136",
    base: SALES_TARGET_PUB_BASE,
  },
};

/**
 * Build the full published-CSV URL for a tab. Used server-side by the proxy
 * route so the browser never has to talk to docs.google.com directly (avoids
 * CORS and lets us force `cache: 'no-store'`).
 */
export function csvUrlForGid(gid: string, base: string = SHEET_PUB_BASE): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}gid=${encodeURIComponent(gid)}`;
}

/**
 * Client refresh cadence (ms). Floored at 60s so an edit in the Sheet shows up
 * on the live site within ~60s without a redeploy. Override with REFRESH_MS.
 */
export const REFRESH_MS = Math.max(
  60_000,
  Number(process.env.NEXT_PUBLIC_REFRESH_MS || process.env.REFRESH_MS || 60_000)
);

/** Brands we report on (Abbott). Used for NU brand-split and ordering. */
export const BRANDS = ["Similac", "Ensure", "Glucerna", "Pediasure"] as const;
export type Brand = (typeof BRANDS)[number];

/** Color thresholds for attainment %. Blue palette elsewhere; red = below target. */
export const ATTAINMENT_THRESHOLDS = {
  green: 100, // >= 100%
  amber: 70, //  70–99%
  // red: < 70%
} as const;
