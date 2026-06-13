# Deploy & edit guide (non-technical)

This is the click-by-click version. You only need to do **Steps 1–3 once**.

## Step 1 — Publish each Sheet tab to the web (one time)

The site reads the Sheet through its "Publish to web → CSV" links. Each of the
**four tabs** must be published:

1. Open the Google Spreadsheet.
2. **File → Share → Publish to web.**
3. Under "Link", pick the tab (e.g. *Total Daily Lead*) and choose
   **Comma-separated values (.csv)**.
4. Click **Publish** → **OK**.
5. Repeat for all four tabs:
   - Total Daily Lead
   - Target & Actual of Lead & NU
   - Total Final NU
   - Training Result

> If a tab isn't published yet, the site shows an amber banner naming exactly
> which tab still needs publishing — nothing else breaks.

## Step 2 — Connect the repo to Vercel (one time)

1. Go to **vercel.com** and sign in with your GitHub account.
2. **Add New… → Project**.
3. Import the **`pa-performance-dashboard`** repository.
4. Leave everything default (Vercel detects Next.js automatically) → **Deploy**.
5. After ~1–2 minutes you'll get a live URL like
   `https://pa-performance-dashboard.vercel.app`.

That's it — no environment variables are required (the gids are already baked
into the code as defaults). You'd only add `NEXT_PUBLIC_SHEET_*` vars later if
you switch to a different spreadsheet.

## Step 3 — Verify

Open the live URL on your phone. You should see live numbers. If any tab shows
an amber "could not be fetched" note, go back to Step 1 for that tab.

---

## How to edit — going forward

- **Change the data:** just edit the Google Sheet. The live site updates within
  **~60 seconds** automatically — no redeploy, no code change.
- **Change the dashboard (layout, a new chart, wording):** ask for the change.
  I open a Pull Request → you click **Squash & merge** on GitHub → Vercel
  auto-builds and the new version is live in **~2 minutes**.
- **Move to a different spreadsheet:** add the new `NEXT_PUBLIC_SHEET_*` values
  in Vercel → Settings → Environment Variables, then redeploy.
