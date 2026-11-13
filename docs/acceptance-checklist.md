# Acceptance checklist

The manual checks for an exploratory pass in a real browser, grouped by the checkpoint that runs them.

Each task that adds something a user can see adds its checks here, under the checkpoint that covers it.

## Checkpoint 1

**Runs:** once LAB-04's app-start checks and LAB-06 to LAB-12 have all merged.

**Covers:** app start and menu, catalog, patients, orders home page, placing an order.

### App start and menu (LAB-04)

- [ ] From a fresh clone with no `.env`: `pnpm install`, then `pnpm dev`. It prints that it copied `.env.example` to `.env`, starts the database, migrates, seeds, and http://localhost:5173 shows the Orders page. No other command is needed.
- [ ] Stop with Ctrl-C: both the API and Vite stop, and nothing is left listening on ports 3000 and 5173.
- [ ] Run `pnpm dev` again: the seed reports 0 rows inserted.
- [ ] Put `PORT=abc` in `.env` and run `pnpm dev`: it stops with the `config.invalid` line before starting anything. Put it back.
- [ ] With Docker stopped, `pnpm dev` prints one line saying Docker is not running and exits with an error.
- [ ] http://localhost:5173/healthz returns the API's `{"status":"ok"}` (the proxy works).
- [ ] The menu bar shows Orders, Patients and Catalog on every page. Clicking each changes the URL and the page without a full reload; the current one is highlighted and has `aria-current="page"`.
- [ ] http://localhost:5173/does-not-exist shows "Page not found" with a link back to the orders page.
- [ ] The footer says "Server: connected". Stop only the API (Vite still running): reloading shows "Can't reach the server. Try again." with a "Try again" button, not a blank page.
- [ ] In a desktop browser window (at least 1024 px wide), Tab reaches every link and button in order, each with a visible focus outline, and Enter follows a focused link.

## Checkpoint 2

**Runs:** once LAB-13 to LAB-17 have all merged.

**Covers:** live preview, filters, detail panel, status changes, cancel.

## Checkpoint 3

**Runs:** in LAB-23.

**Covers:** everything, including idempotent create, patient order history and the New order entry points.
