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
- [ ] On `/styles`, each badge shows its label (Ordered, Collected, Completed, Cancelled) in its own tint, and the invalid "Code" field shows its error text (the browser's inspector shows `aria-invalid="true"`).
- [ ] On `/styles`, Tab reaches every enabled link, field and button, from the menu bar to "Open a panel", each with a visible outline (lime in the menu bar, teal elsewhere). Hovering a button changes its look.
- [ ] "Open a dialog" and "Open a panel" open over a dimmed page (the panel on the right, full height); Escape closes them.
- [ ] In the browser's network panel, a reload of `/styles` requests nothing from another site and no font.

### Catalog: see and add lab tests (LAB-06)

- [ ] After `pnpm db:seed`, Catalog in the menu bar opens the Lab tests page, which lists exactly 8 tests in this order: A1C, CBC, CMP, CULT, LIPID, TSH, UA, VITD, each with a price like `$25.00`, a turnaround like "1 business day" or "3 business days", and the status "Active" (it said "Yes" before LAB-07).
- [ ] Add code `demo-09`, name "Demo Panel", price `19.99`, turnaround `2`: the form clears and the table shows `DEMO-09`, `$19.99`, "2 business days", Active, without a page reload. `docker compose exec db psql -U lab_orders -d lab_orders -c "select price_cents from lab_tests where code = 'DEMO-09'"` shows 1999.
- [ ] Add code `cbc` (or `CBC`, `Cbc`): "This code already exists" appears under the code field, and the table still has one CBC.
- [ ] Each of these shows a message under the right field and sends no request (the browser's network tab stays empty): a blank name; a price of `-1`, `12.345` or `abc`; a turnaround of `0`, `1.5` or `366`.
- [ ] A price of `0` is accepted and shows as `$0.00`.
- [ ] The page uses the theme: the price column is right-aligned, each field has its help text under it, errors are red under their field with a red outline on the input, and "Clear" empties the form and removes the messages.
- [ ] Stop the API (keep Vite running) and reload the page: the list shows "Can't reach the server. Try again." with a "Try again" button, not a blank table. With the API running but the database stopped (`pnpm db:down`), the list shows "Something went wrong on the server. Try again. Reference: <id>"; the same id is on the `request.failed` line in the API's log.
- [ ] Run `pnpm db:seed` a second time: it reports 0 rows inserted, and the page still shows the same tests.

### Catalog: edit and activate or deactivate tests (LAB-07)

- [ ] Click Edit on the `CBC` row: the heading under the table reads "Edit CBC", the fields hold CBC's values (price in dollars, like `25.00`), and the Code field is greyed out with "Code cannot be changed" under it; typing into it does nothing.
- [ ] Change the name and Save changes: the row shows the new name with the code still `CBC`, and the form is back to "Add a lab test", without a page reload. In the network tab the `PATCH /api/lab-tests/<id>` body holds only `name`.
- [ ] Edit CBC's price to `25.00` and save: the table shows `$25.00`, and `docker compose exec db psql -U lab_orders -d lab_orders -c "select price_cents from lab_tests where code = 'CBC'"` shows 2500.
- [ ] Edit a row, change a field, then Cancel: nothing is sent, the row is unchanged and the form is back to adding. Edit, change nothing, Save changes: nothing is sent and the form closes.
- [ ] Edit a row and set the turnaround to `0`: the message appears under Turnaround and nothing is sent.
- [ ] Click Deactivate on `TSH`: the row turns grey, its status reads "Inactive" and the button reads "Activate", without a reload; the API log has `lab_test.updated` with `"active":"deactivated"`. Click Activate: it is back to "Active", logged `"active":"activated"`.
- [ ] No row has a delete control. `curl -i -X DELETE http://localhost:<PORT>/api/lab-tests/<a real id>` answers 404 `NOT_FOUND`, and the test is still listed.
- [ ] `curl -i -X PATCH -H 'content-type: application/json' -d '{"code":"NEW-1"}' http://localhost:<PORT>/api/lab-tests/<CBC id>` answers 400 `VALIDATION_ERROR` with a detail on `code`, and CBC keeps its code.

### Patients: add and list (LAB-08)

- [ ] After `pnpm db:seed`, Patients lists exactly 6 patients, sorted by last name (Example, Patient, Person, Record, Sample, Tester). With the table empty (`truncate patients` in `psql`), the page shows "No patients yet. Add the first one with New patient."
- [ ] New patient, fill every field, Save patient: the list opens and shows the patient, with the date of birth exactly as typed (`1984-03-09` shows "Mar 9, 1984").
- [ ] Save with first name, last name or date of birth empty: an error appears under that field, and goes away when the field is edited.
- [ ] Save with neither email nor phone: an error appears under both; typing in either clears both. Only an email, or only a phone, saves.
- [ ] Date of birth `2020-02-30`, `1984-13-01`, tomorrow's date and `31/12/1990` each show an error under date of birth; today's date and `2020-02-29` save.
- [ ] Phones typed `(801) 555-0100`, `801.555.0100` and `+1 801 555 0100` each show as `(801) 555-0100` in the list (stored as `8015550100`); an email typed `Jane@Example.test` shows as `jane@example.test`. A phone of `abc`, `801 555 01OO` or `555-0100` (no area code) shows an error under phone, and the help text under Phone asks for a US number with its area code.
- [ ] The Save patient button is disabled and reads "Saving…" while the request runs.
- [ ] With the API stopped, Patients shows "Can't reach the server. Try again." with a Try again button.
- [ ] While doing all of the above, the API's log (the `pnpm dev` output) shows `patient.created` with an id only, and no name, date of birth, email or phone on any line.

### Patients: search and edit (LAB-09)

- [ ] After `pnpm db:seed`, typing `sample` in "Search by name" shows Another Sample and Sample Person; `SAMPLE`, `Sa` and `sample per` find them the same way (`sample per` only Sample Person). No request is sent until typing pauses (one request in the network tab, not one per key), and Enter searches at once.
- [ ] Searching `zzz` shows "No patients match" and no table; clearing the box shows every patient again.
- [ ] Searching `%` or `_` shows "No patients match".
- [ ] After a search the address is `/patients?q=...`; reloading the page keeps the text in the box and the same rows. Clicking Patients in the menu clears the search.
- [ ] Clicking a name, or the row's Edit button (in an Actions column, styled like the catalog's row actions), opens `/patients/<id>`, headed with the name and date of birth, with the stored values in the form (phone as `(801) 555-0101`, an absent email empty).
- [ ] Change the phone and Save changes: "Saved" appears, the page stays, and the Patients list shows the new phone. Save again without changing anything: "No changes to save." and no request.
- [ ] Clear both email and phone and save: the contact error appears under both fields with a reference, nothing is saved (reload shows the old values).
- [ ] Edit the date of birth to `2020-02-30` or a date after today: an error under date of birth and no request. An accepted date (`2020-02-29`) shows as "Feb 29, 2020" in the heading and the list, with no day shift.
- [ ] `/patients/00000000-0000-4000-8000-000000000000` and `/patients/abc` show "Patient not found" with a Back to patients button.
- [ ] While doing all of the above, the API's log (with `LOG_LEVEL=debug`) shows `patient.updated` with an id and field names, `patient.search` with `hasQuery` and `resultCount`, request lines with the route `/api/patients` or `/api/patients/:id`, and never the search text, a name, a date of birth, an email or a phone.

### Orders: the home page (LAB-11)

- [ ] After `pnpm dev` on an empty database (`docker compose down -v` first), the home page lists exactly 4 orders, newest first: Test Patient (1 test, $52.50, ready Nov 13, 2026 (placed on a Saturday, so Monday is business day 1), Ordered, Nov 7, 2026, 11:00 am), Fake Tester (3 tests, $132.00, Nov 9, 2026, Collected), Sample Person (2 tests, $56.00, Nov 3, 2026, Ordered, Oct 30, 2026, 12:00 pm), Demo Example (3 tests, $122.50, Oct 28, 2026, Completed).
- [ ] Each patient is shown with the date of birth ("Sample Person (born Dec 31, 1990)") as a link to that patient's page, the Tests and Total columns are right-aligned, and each status is a tinted badge with its label.
- [ ] The last column is headed "Created (America/Denver)". Change the computer's time zone (or start the browser with another `TZ`) and reload: the Friday order still shows 12:00 pm.
- [ ] `docker compose exec db psql -U lab_orders -d lab_orders -c "\d orders"` shows no total column; `select sum(price_cents) from order_items where order_id = '5eed0011-0000-4000-8000-000000000002'` gives 13200, the $132.00 on screen.
- [ ] Run `pnpm db:seed` a second time: it reports 0 rows inserted, and the page still shows the same 4 orders.
- [ ] With no orders (`truncate orders, order_items` in `psql`), the page shows "No orders yet". Stop the API and reload: "Can't reach the server. Try again." with a Try again button.
- [ ] The API's log for the page load has the request line and nothing with a patient's name or date of birth.

## Checkpoint 2

**Runs:** once LAB-13 to LAB-17 have all merged.

**Covers:** live preview, filters, detail panel, status changes, cancel.

## Checkpoint 3

**Runs:** in LAB-23.

**Covers:** everything, including idempotent create, patient order history and the New order entry points.
