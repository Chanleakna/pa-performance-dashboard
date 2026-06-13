/** Small formatting helpers shared across pages. */

export function fmtInt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "–";
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || isNaN(n)) return "–";
  return `${n.toFixed(digits)}%`;
}

/** Compact large numbers: 1.2K, 3.4M, 1.1B. */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

/** Tailwind classes for an attainment status — blue elsewhere, red only here. */
export function statusClasses(status: "green" | "amber" | "red" | "none"): string {
  switch (status) {
    case "green":
      return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
    case "amber":
      return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
    case "red":
      return "bg-red-100 text-red-700 ring-1 ring-red-200";
    default:
      return "bg-slate-100 text-slate-500 ring-1 ring-slate-200";
  }
}

/** Hex color for charts (kept off red unless "below target"). */
export function statusColor(status: "green" | "amber" | "red" | "none"): string {
  switch (status) {
    case "green":
      return "#16a34a";
    case "amber":
      return "#d97706";
    case "red":
      return "#dc2626";
    default:
      return "#94a3b8";
  }
}

export const BRAND_COLORS: Record<string, string> = {
  Similac: "#2563eb", // brand blue
  Ensure: "#0ea5e9", // sky
  Glucerna: "#14b8a6", // teal
  Pediasure: "#6366f1", // indigo
  Other: "#94a3b8",
};
