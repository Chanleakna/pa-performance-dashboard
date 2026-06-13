# PA Performance Dashboard

A phone-friendly, **live** dashboard for management to track Product Ambassador
(PA) sales performance for the Abbott nutrition team in Cambodia (Similac,
Ensure, Glucerna, Pediasure). It reads its data directly from **published Google
Sheets CSV** — there is no embedded snapshot, no service account, and no login.
Edit a cell in the Sheet and the change appears on the live site within ~60s.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · SWR · PapaParse · Recharts.
Hosted on **Vercel**, source on **GitHub**, auto-deploys on push to `main`.

## How the data flows

```
Google Sheet (Publish to web → CSV)
   → /api/sheet?tab=…   (server proxy, cache: 'no-store' — avoids CORS)
   → SWR client fetch   (refreshInterval ≥ 60s)
   → PapaParse → app/lib/parse.ts → app/lib/model.ts → pages
```

All four CSV URLs/gids and the refresh cadence live in
[`app/lib/config.ts`](app/lib/config.ts) and are overridable with
`NEXT_PUBLIC_SHEET_*` env vars (see [`.env.example`](.env.example)).

## The four source tabs

| Tab | gid | Notes |
|---|---|---|
| Total Daily Lead | `0` | One row = one lead. `Created At` is **day-first** (25/01/2026). |
| Target & Actual of Lead & NU | `1170729989` | **Wide cross-tab, 2-row header.** March has `Quali.Lead` (no `Tar.Lead`); parsed by scanning row-1 labels, not fixed offsets. |
| Total Final NU | `1699661674` | `Contact ID` holds the PA/outlet name — NU joins to PAs on it (~76%). |
| Training Result | `1990560513` | `Name` column is empty → team/topic-level only. |

## Business rules (locked)

- **ASM (Team Leader)** for a PA = column 5 of the Target tab. Unmatched daily
  rows → "Unassigned".
- **Attainment %** = daily-lead row count ÷ `Tar.Lead`, **only** for months that
  have both a target and real daily actuals → **Jan, Feb, Apr 2026**. March is
  excluded (no `Tar.Lead`), but still appears in lead-only views.
- Colors: green ≥100%, amber 70–99%, red <70% — but the theme is blue/white;
  red is used only as the "below target" status color.
- **IMS / Act.Sales does not exist in these sheets** — those panels are visible
  placeholders, never fabricated numbers.

## Pages

Overview · Leaderboard · ASM Teams · Trends · BI Report (with cascading
Month / Team Leader / PA slicers).

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

> Note: fetching the live CSVs requires outbound access to `docs.google.com`.
> Some sandboxed environments block this; on Vercel and in a normal browser it
> works once each tab is Published to web.

## Deploy (Vercel)

1. Push to GitHub (this repo).
2. In Vercel → **Add New → Project** → import this repo → **Deploy**
   (framework auto-detected as Next.js; no settings needed).
3. (Optional) add any `NEXT_PUBLIC_SHEET_*` env vars if you move spreadsheets.
4. Every push to `main` auto-builds and redeploys.

See [`DEPLOY.md`](DEPLOY.md) for the step-by-step, non-technical version.
