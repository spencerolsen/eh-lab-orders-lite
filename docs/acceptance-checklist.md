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
- [ ] `PORT=5173 corepack pnpm dev` (a `PORT` in the shell overrides `.env`) prints one line saying `PORT` and `WEB_PORT` are both 5173 and must differ, and exits with an error before starting anything.
- [ ] `DB_PORT=5434 corepack pnpm dev`, with the URLs in `.env` still on 5433, prints one line saying `DATABASE_URL` uses port 5433 but the container listens on `DB_PORT` 5434, and exits with an error before starting anything.
- [ ] http://localhost:5173/healthz returns the API's `{"status":"ok"}` (the proxy works).
- [ ] The menu bar shows Orders, Patients and Catalog on every page. Clicking each changes the URL and the page without a full reload; the current one is highlighted and has `aria-current="page"`.
- [ ] http://localhost:5173/does-not-exist shows "Page not found" with a link back to the orders page.
- [ ] The footer says "Server: connected". Then stop `pnpm dev` with Ctrl-C and run `pnpm dev:web` on its own, so Vite runs without the API, and reload the page: the footer shows "Can't reach the server. Try again." with a "Try again" button, not a blank page. Stop `pnpm dev:web` with Ctrl-C afterwards.
- [ ] In a desktop browser window (at least 1024 px wide), Tab reaches every link and button in order, each with a visible focus outline, and Enter follows a focused link.

### Visual theme (LAB-24)

- [ ] Every page (Orders, Patients, Catalog, "Page not found") has the teal menu bar, the cream page, serif headings and the footer, with no unstyled element. The current section is a lime pill.
- [ ] http://localhost:5173/styles shows headings, text, each button with its disabled state, a form with a valid and an invalid field, a table, the four status badges, and the loading, empty and error components. It is not in the menu.
- [ ] On `/styles`, each badge shows its word (ordered, collected, completed, cancelled) in its own tint, and the invalid "Code" field shows its error text (the browser's inspector shows `aria-invalid="true"`).
- [ ] On `/styles`, Tab reaches every enabled link, field and button, from the menu bar to "Open a panel", each with a visible outline (lime in the menu bar, teal elsewhere). Hovering a button changes its look.
- [ ] "Open a dialog" and "Open a panel" open over a dimmed page (the panel on the right, full height); Escape closes them.
- [ ] In the browser's network panel, a reload of `/styles` requests nothing from another site and no font.

### Catalog: see and add lab tests (LAB-06)

- [ ] After `pnpm db:seed`, Catalog in the menu bar opens the Lab tests page, which lists exactly 8 tests in this order: A1C, CBC, CMP, CULT, LIPID, TSH, UA, VITD, each with a price like `$25.00`, a turnaround like "1 business day" or "3 business days", and Active "Yes".
- [ ] Add code `demo-09`, name "Demo Panel", price `19.99`, turnaround `2`: the form clears and the table shows `DEMO-09`, `$19.99`, "2 business days", Yes, without a page reload. `docker compose exec db psql -U lab_orders -d lab_orders -c "select price_cents from lab_tests where code = 'DEMO-09'"` shows 1999.
- [ ] Add code `cbc` (or `CBC`, `Cbc`): "This code already exists" appears under the code field, and the table still has one CBC.
- [ ] Each of these shows a message under the right field and sends no request (the browser's network tab stays empty): a blank name; a price of `-1`, `12.345` or `abc`; a turnaround of `0` or `1.5`.
- [ ] A price of `0` is accepted and shows as `$0.00`.
- [ ] Stop the API (keep Vite running) and reload the page: the list shows "Can't reach the server. Try again." with a "Try again" button, not a blank table. With the API running but the database stopped (`pnpm db:down`), the list shows "Something went wrong on the server. Try again. Reference: <id>"; the same id is on the `request.failed` line in the API's log.
- [ ] Run `pnpm db:seed` a second time: it reports 0 rows inserted, and the page still shows the same tests.

## Checkpoint 2

**Runs:** once LAB-13 to LAB-17 have all merged.

**Covers:** live preview, filters, detail panel, status changes, cancel.

## Checkpoint 3

**Runs:** in LAB-23.

**Covers:** everything, including idempotent create, patient order history and the New order entry points.
