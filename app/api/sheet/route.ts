import { NextRequest, NextResponse } from "next/server";
import { SHEET_TABS, csvUrlForGid, type SheetKey } from "@/app/lib/config";

// Always run fresh — never serve a cached/snapshotted CSV.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/sheet?tab=daily
 *   or
 * GET /api/sheet?gid=0
 *
 * Server-side proxy for a single published Google Sheet CSV tab. Fetches with
 * `cache: 'no-store'` so the live site always reflects the current Sheet, and
 * returns the raw CSV text. Proxying server-side avoids browser CORS issues
 * with docs.google.com and keeps caching under our control.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") as SheetKey | null;
  const explicitGid = searchParams.get("gid");

  let gid: string | null = explicitGid;
  if (!gid && tab && SHEET_TABS[tab]) {
    gid = SHEET_TABS[tab].gid;
  }

  if (!gid) {
    return NextResponse.json(
      { error: "Missing or unknown `tab`/`gid` parameter." },
      { status: 400 }
    );
  }

  const url = csvUrlForGid(gid);

  try {
    const upstream = await fetch(url, {
      cache: "no-store",
      // A UA helps Google return the CSV rather than an interstitial.
      headers: { "User-Agent": "pa-performance-dashboard/1.0 (+vercel)" },
    });

    if (!upstream.ok) {
      // Most common cause: the tab has not been "Published to web" as CSV yet.
      return NextResponse.json(
        {
          error: `Upstream returned ${upstream.status} for gid ${gid}.`,
          hint:
            upstream.status === 404 || upstream.status === 401
              ? "This tab is probably not Published to web as CSV yet. In Google Sheets: File → Share → Publish to web → choose this tab → CSV."
              : "Check the spreadsheet base URL and gid in app/lib/config.ts.",
          gid,
        },
        { status: 502 }
      );
    }

    const text = await upstream.text();

    // Guard against Google returning an HTML login/error page instead of CSV.
    const looksLikeHtml = /^\s*<(!doctype|html)/i.test(text);
    if (looksLikeHtml) {
      return NextResponse.json(
        {
          error: `Upstream returned HTML, not CSV, for gid ${gid}.`,
          hint: "This tab is likely not Published to web as CSV. File → Share → Publish to web → this tab → CSV.",
          gid,
        },
        { status: 502 }
      );
    }

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to fetch upstream CSV.",
        detail: err instanceof Error ? err.message : String(err),
        gid,
      },
      { status: 502 }
    );
  }
}
