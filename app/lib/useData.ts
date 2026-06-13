"use client";

/**
 * Client-side data hook. Fetches all four tabs through our same-origin proxy
 * (`/api/sheet?tab=...`) via SWR with a >=60s refreshInterval, parses each with
 * PapaParse, and builds the derived dashboard model. An edit in the Google
 * Sheet therefore shows up on the live site within ~one refresh, no redeploy.
 */
import useSWR from "swr";
import { useMemo } from "react";
import { REFRESH_MS } from "./config";
import {
  parseDailyLeads,
  parseTargetActual,
  parseFinalNU,
  parseTraining,
  parseSales,
} from "./parse";
import { buildModel, type DashboardModel } from "./model";

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.hint || j?.error || "";
    } catch {
      /* not JSON */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.text();
}

const swrOpts = {
  refreshInterval: REFRESH_MS,
  revalidateOnFocus: true,
  keepPreviousData: true,
  dedupingInterval: 30_000,
};

export interface UseDataResult {
  model: DashboardModel | null;
  isLoading: boolean;
  /** Per-tab errors, keyed by tab. Tells the user which tab to publish. */
  errors: Partial<Record<"daily" | "target" | "nu" | "training" | "sales", string>>;
  /** Last successful refresh time (client clock). */
  updatedAt: Date | null;
  refresh: () => void;
}

export function useDashboardData(): UseDataResult {
  const daily = useSWR("/api/sheet?tab=daily", fetchCsv, swrOpts);
  const target = useSWR("/api/sheet?tab=target", fetchCsv, swrOpts);
  const nu = useSWR("/api/sheet?tab=nu", fetchCsv, swrOpts);
  const training = useSWR("/api/sheet?tab=training", fetchCsv, swrOpts);
  const sales = useSWR("/api/sheet?tab=sales", fetchCsv, swrOpts);

  const model = useMemo<DashboardModel | null>(() => {
    if (!daily.data && !target.data && !nu.data && !training.data && !sales.data)
      return null;
    try {
      return buildModel(
        daily.data ? parseDailyLeads(daily.data) : [],
        target.data
          ? parseTargetActual(target.data)
          : { rows: [], months: [], paToAsm: {}, asms: [] },
        nu.data ? parseFinalNU(nu.data) : [],
        training.data ? parseTraining(training.data) : [],
        sales.data ? parseSales(sales.data) : { byCode: {}, total: 0 }
      );
    } catch (e) {
      // A parse failure shouldn't blank the whole page; surface via errors.
      console.error("Model build failed", e);
      return null;
    }
  }, [daily.data, target.data, nu.data, training.data, sales.data]);

  const errors: UseDataResult["errors"] = {};
  if (daily.error) errors.daily = String(daily.error.message || daily.error);
  if (target.error) errors.target = String(target.error.message || target.error);
  if (nu.error) errors.nu = String(nu.error.message || nu.error);
  if (training.error)
    errors.training = String(training.error.message || training.error);
  if (sales.error) errors.sales = String(sales.error.message || sales.error);

  const isLoading =
    (daily.isLoading ||
      target.isLoading ||
      nu.isLoading ||
      training.isLoading ||
      sales.isLoading) &&
    !model;

  const refresh = () => {
    daily.mutate();
    target.mutate();
    nu.mutate();
    training.mutate();
    sales.mutate();
  };

  return {
    model,
    isLoading,
    errors,
    updatedAt: model ? new Date() : null,
    refresh,
  };
}
