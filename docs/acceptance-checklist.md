# Acceptance checklist

The manual checks for an exploratory pass in a real browser, grouped by the checkpoint that runs them.

Each task that adds something a user can see adds its checks here, under the checkpoint that covers it.

## Checkpoint 1

**Runs:** once LAB-04's app-start checks and LAB-06 to LAB-12 have all merged.

**Covers:** app start and menu, catalog, patients, orders home page, placing an order.

### App start and menu (LAB-04)

Commands are written `pnpm <script>`: run them as `corepack pnpm <script>` unless `corepack enable` was run (see the README).

- [ ] From a fresh clone with no `.env` and no `pnpm` on the PATH: `corepack pnpm install`, then `corepack pnpm dev`. It prints that it copied `.env.example` to `.env`, starts the database, migrates, seeds, and http://localhost:5173 shows the Orders page. No other command is needed.
- [ ] Stop with Ctrl-C: both the API and Vite stop, and nothing is left listening on ports 3000 and 5173.
- [ ] Run `pnpm dev` again: the seed reports 0 rows inserted.
- [ ] Put `PORT=abc` in `.env` and run `pnpm dev`: it stops with the `config.invalid` line before starting anything. Put it back.
- [ ] With Docker stopped, `pnpm dev` prints one line saying Docker is not running and exits with an error.
- [ ] With another program listening on port 3000 (for example `python3 -m http.server 3000 --bind 127.0.0.1`), `pnpm dev` prints one line naming port 3000 and exits with an error before starting anything. The same for port 5173.
- [ ] `PORT=5173 corepack pnpm dev` (a `PORT` in the shell overrides `.env`) prints one line saying `PORT` is the web app's port and to set another number, and exits with an error before starting anything.
- [ ] http://localhost:5173/healthz returns the API's `{"status":"ok"}` (the proxy works).
- [ ] The menu bar shows Orders, Patients and Catalog on every page. Clicking each changes the URL and the page without a full reload; the current one is highlighted and has `aria-current="page"`.
- [ ] http://localhost:5173/does-not-exist shows "Page not found" with a link back to the orders page.
- [ ] The footer says "Server: connected". Then stop `pnpm dev` with Ctrl-C and run `pnpm dev:web` on its own, so Vite runs without the API, and reload the page: the footer shows "Can't reach the server. Try again." with a "Try again" button, not a blank page. Stop `pnpm dev:web` with Ctrl-C afterwards.
- [ ] In a desktop browser window (at least 1024 px wide), Tab reaches every link and button in order, each with a visible focus outline, and Enter follows a focused link.

## Checkpoint 2

**Runs:** once LAB-13 to LAB-17 have all merged.

**Covers:** live preview, filters, detail panel, status changes, cancel.

## Checkpoint 3

**Runs:** in LAB-23.

**Covers:** everything, including idempotent create, patient order history and the New order entry points.
