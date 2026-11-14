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
- [ ] The menu bar shows Orders, Patients and Catalog on every page, and nothing else (no "New order" button: orders are placed from the orders page and the patient page). Clicking each changes the URL and the page without a full reload; the current one is highlighted and has `aria-current="page"`.
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

### Patients: duplicate warning on create (LAB-10)

- [ ] After `pnpm db:seed`, New patient with any new name and date of birth and the email `SAMPLE.Person@Example.test`: Save patient shows "This patient may already exist" above the form, with "Sample Person (born Dec 31, 1990)", its email and its phone (or "none"), and an "Open this patient" link. The form keeps every value typed, and keyboard focus is on the warning.
- [ ] The Patients list still has the same number of patients (nothing was created).
- [ ] A phone typed `(801) 555-0101` matches Demo Example (stored as `8015550101`). `test` `PATIENT` born `1984-03-09` (with a new email) matches Test Patient; Test Patient born `1984-03-10`, `Other` `Patient` born `1984-03-09`, or `Tes` `Patient` born `1984-03-09` does not, and saves.
- [ ] Email `sample.person@example.test` with phone `(801) 555-0101` lists Demo Example and Sample Person, each once, by last name.
- [ ] Open this patient opens that patient's page.
- [ ] Create anyway (the secondary button) saves the patient and the list shows both records. It and Save patient are disabled while it runs.
- [ ] With the warning showing, edit any field: the warning goes away, and Save patient checks again.
- [ ] Editing a patient's email to another patient's email on the patient page saves with no warning.
- [ ] While doing all of the above, the API's log (with `LOG_LEVEL=debug`) shows `patient.possible_duplicate` at warn with `matchCount` and `rules` such as `["email"]`, `patient.possible_duplicate.matches` with ids only, `patient.created` with `duplicateConfirmed: true` after Create anyway, and never a name, date of birth, email or phone.

### Orders: place an order (LAB-12)

- [ ] On the Orders page, "Place new order" opens the New order dialog over a dimmed page, with the focus in the Patient search. "Add a test" is disabled with the hint "Choose a patient first", and "Submit order" is disabled.
- [ ] Type `sample`: after a short pause the matching patients appear with name and date of birth. Pick Sample Person: the dialog shows "Sample Person (born Dec 31, 1990)" with a Change button, and the focus moves to "Add a test".
- [ ] Type `li`: LIPID is offered (with CMP, whose name contains "li", after it). Type `cbc` and `CBC`: the same list, CBC first. Press Enter without an arrow: nothing is added and nothing is sent.
- [ ] Arrow Down, then Enter: the highlighted test is added to the table (code, name, price, turnaround, Remove) and the box is empty. A test already added is no longer offered. Escape with suggestions open closes only the suggestions; Escape again closes the dialog and the focus returns to "Place new order".
- [ ] Add CBC and LIPID for Sample Person and press "Submit order": the dialog closes and the new order is first in the list with 2 tests, $63.00, Ordered, and a ready date two business days after today.
- [ ] Deactivate TSH in `psql` (`update lab_tests set is_active = false where code = 'TSH'`) while the dialog is open with TSH added, then submit: the dialog stays open with the patient and TSH, and shows "Some of the chosen tests cannot be ordered. Reference: <id>". Reopen the dialog: TSH is no longer offered. Set it active again afterwards.
- [ ] Change CBC's price on the Catalog page after ordering: the order's total in the list is unchanged.
- [ ] The API's log (with `LOG_LEVEL=debug`) shows `order.ready_date_estimated` and `order.created` with ids and counts, and the refusal as `request.rejected` `INVALID_ORDER_TESTS`; no patient name, date of birth, search text or test name.

## Checkpoint 2

**Runs:** once LAB-13 to LAB-17 have all merged.

**Covers:** live preview, filters, detail panel, status changes, cancel.

### Live total and ready date (LAB-13)

- [ ] Open New order, choose a patient: the summary says "Add a test to see the total", and the browser's network tab shows no request to `/api/orders/quote`.
- [ ] Add CBC: the total is CBC's catalog price and a ready date is shown. Add a second test: the total is the sum of both. Remove it: the first total and date are back.
- [ ] With the longest-turnaround test chosen, remove it: the ready date moves to match the longest remaining turnaround.
- [ ] Typing in the quick-add box sends no quote request; only adding or removing a test does.
- [ ] Submit the order: its total and ready date in the Orders list equal the ones the summary showed.
- [ ] Stop the API (or block `/api/orders/quote`), add a test: the summary shows a plain message with a "Reference:" id, and "Submit order" is still enabled.
- [ ] `curl -X POST localhost:3000/api/orders/quote -H 'content-type: application/json' -d '{"labTestIds":[]}'` gives 422 `INVALID_ORDER_TESTS`; the Orders list has no new row after any quote.

### Orders list filters (LAB-14)

- [ ] Choose "Collected" in "Filter by status": only collected orders remain and the address bar shows `?status=collected`. Choose "All statuses": the filter and the parameter go.
- [ ] Type part of a patient's name in "Filter by patient" and pick one: only that patient's orders remain, the address has `?patientId=<id>` and no name, and the chosen patient shows with their date of birth. Two patients with the same name can be told apart by it. "Remove patient filter" brings the search box back and the full list.
- [ ] Both filters together show only orders matching both.
- [ ] Reload, and open the address in a new tab: the same filters and rows come back, and the patient is shown by name from the id. The browser's Back and Forward buttons step through the filter changes.
- [ ] With a filter set, open an order, then close it: the filter is still set. Open `/?order=<id>&status=ordered`: the panel and the filter are both there.
- [ ] Tab reaches the status select and the patient search; the select is changed with the arrow keys; each has a visible label.
- [ ] With more than 25 matching orders, "Load more" appears below the table; pressing it adds the rest and the button goes. With exactly 25, it does not appear. Changing a filter starts again from the first page.
- [ ] A filter that matches nothing shows "No orders match these filters" with "Clear filters", which restores the full list. With no filter and no orders the message is "No orders yet".
- [ ] `curl 'localhost:3000/api/orders?status=bogus'` (and `limit=0`, `limit=101`, `offset=-1`, `patientId=abc`, `colour=red`) gives 400 `VALIDATION_ERROR` with a request id; an unknown but well-formed `patientId` gives 200 with an empty `items`.
- [ ] With `LOG_LEVEL=debug` the API's log shows `orders.listed` with filter names and a row count, and no patient name, id or search text.

### Order detail panel (LAB-15)

- [ ] Click a row in the Orders list: a panel slides in from the right and the address bar shows `?order=<id>`. Focus is inside the panel.
- [ ] The panel shows the status badge, the patient's name and date of birth, the ready date, the created time labelled "Created (America/Denver)", each test's code, name and price, and the total, and no buttons other than Close, the status button for the order's status and, for an order that can be cancelled, "Cancel order" (LAB-16 and LAB-17, below).
- [ ] Change the computer's time zone and reload: the created time is unchanged.
- [ ] Press Escape: the panel closes, `?order=` is gone from the address and focus is back on that row's View button. The list behind it still works.
- [ ] Open a panel, then press the browser's back button: the panel closes and you stay on the Orders list. Close it with the Close button and with a click on the dark backdrop too.
- [ ] Tab to a row's View button and press Enter: the panel opens.
- [ ] Reload with `?order=<id>` in the address: the panel is open again. Copy the address into a new tab: same.
- [ ] Open `/?order=5eed0011-0000-4000-8000-0000000000ff`: the panel says "Order not found" with a Close button, and the list is behind it. Open `/?order=nonsense`: the same, and nothing crashes.
- [ ] `curl localhost:3000/api/orders/nonsense` gives 400 `VALIDATION_ERROR`; a well-formed unknown id gives 404 `NOT_FOUND`.
- [ ] The API's log for opening a panel has the request line, the query lines and `order.loaded` with an id and a count, and nothing with a patient's name, date of birth or contact detail.

### Mark an order collected or completed (LAB-16)

- [ ] Open an `ordered` order: the only status button is "Mark collected". Press it: the panel shows Collected and only "Mark completed", focus is still inside the panel, and the row's badge in the list behind it shows Collected without a reload.
- [ ] Press "Mark completed": the panel shows Completed and no status buttons (only Close). A cancelled order shows none either.
- [ ] Open the same `ordered` order in two tabs. Press "Mark collected" in the first, then in the second: the second shows the server's refusal ("An order cannot move from collected to collected", a 422, because the server reads the order as it is now) with a reference, and reloads to show Collected and "Mark completed".
- [ ] The 409: in `docker compose exec db psql -U lab_orders lab_orders`, run `begin; lock table orders in share mode;`, press "Mark collected" on the same `ordered` order in two tabs, then `commit;`. One tab shows Collected; the other says "This order was changed by someone else" with a reference, and reloads to show Collected and "Mark completed".
- [ ] `curl -X POST localhost:3000/api/orders/<an ordered order's id>/transitions -H 'content-type: application/json' -d '{"to":"completed"}'` gives 422 `ILLEGAL_TRANSITION` and the status stays `ordered`; on a completed order both `collected` and `completed` give 422.
- [ ] The same with an unknown well-formed id gives 404 `NOT_FOUND`; with `{}`, `{"to":"shipped"}` or `{"to":"cancelled"}` it gives 400 `VALIDATION_ERROR`.
- [ ] After a change, `select status, updated_at, estimated_ready_date from orders where id = '<id>'` shows the new status and a new `updated_at`, and the same ready date as before.
- [ ] The API's log has `order.status_changed` at info for a change, `order.transition_refused` and `order.transition_lost_race` at warn for a refusal and a lost race, each with the order id and statuses, and nothing with a patient's name, date of birth or contact detail.

### Cancel an order (LAB-17)

- [ ] An `ordered` order and a `collected` order each show "Cancel order" next to the status button; a `completed` order shows none.
- [ ] Press "Cancel order": a form opens inside the panel (no second pop-up) with "Note" and "Your name", "Confirm cancel" and "Keep order", and focus is in the note. "Keep order" closes it and sends nothing.
- [ ] Press "Confirm cancel" with both fields empty (or only spaces): "Note is required" shows under the note and "Your name is required" under the name, and the network tab shows no request to `/cancel`.
- [ ] Cancel a `collected` order with a note and a name: the panel shows Cancelled, "Cancelled by NAME on DATE: NOTE" with the clinic's time, and no status or cancel buttons; the row's badge behind it shows Cancelled without a reload.
- [ ] Choose "Cancelled" in "Filter by status": the order is there, with the same test count and total as before.
- [ ] `select status, cancellation_note, cancelled_by, cancelled_at from orders where id = '<id>'` shows all three set; `select count(*) from order_items where order_id = '<id>'` is unchanged.
- [ ] `curl -X POST localhost:3000/api/orders/<id>/cancel -H 'content-type: application/json' -d '{"note":"x","cancelledBy":"y"}'` on a completed or a cancelled order gives 422 `ILLEGAL_TRANSITION`; on an unknown well-formed id 404 `NOT_FOUND`; with `{}`, `{"note":" ","cancelledBy":"y"}`, a 501-character note, a 101-character name or an extra field 400 `VALIDATION_ERROR`, and the order is unchanged.
- [ ] The 409: in `psql`, `begin; lock table orders in share mode;`, press "Confirm cancel" on the same order in two tabs, then `commit;`. One tab shows the cancellation; the other says "This order was changed by someone else" and reloads to show it cancelled, and the stored note is the first tab's.
- [ ] In `psql`, `update orders set status = 'cancelled' where id = '<an ordered order>'` fails with `orders_cancellation_complete`.
- [ ] The API's log has `order.cancelled` at info with the order id and `from` only, and no line contains the note or the name typed.

## Checkpoint 3

**Runs:** in LAB-23.

**Covers:** everything, including idempotent create, patient order history and New order from the orders page and the patient page.

### Patient page: order history (LAB-19)

- [ ] Open a patient who has two orders (`/patients/<id>`): the Orders section under the form lists exactly those two, newest first, with created time, status, ready date, total and number of tests, and none of another patient's.
- [ ] Open a patient with no orders: the section says "No orders yet".
- [ ] Open `/patients/new`: there is no Orders section, and the Network tab shows no `GET /api/orders`.
- [ ] Click a row: the same slide-out panel as on the orders page opens with that order's tests, frozen prices, total and status, and the address has `?order=<id>`. Browser Back closes it and stays on the patient page.
- [ ] Open `/patients/<id>?order=<that order's id>` directly: the panel opens on load.
- [ ] With the API stopped after the page loaded, reload the orders by pressing "Try again" in the section (or use a throttled/blocked `GET /api/orders` in the browser's tools): the section shows a plain-language message, with "Reference: <request id>" when the server answered, and the patient form above can still be edited and saved.
- [ ] A patient with more orders than one page shows "Load more", as on the orders page.

### No duplicate orders (LAB-18)

- [ ] Open New order, choose a patient and a test, and double-click "Submit order" as fast as you can: the button reads "Submitting…" and is disabled while the request runs, the modal closes, and the list shows one new order, not two. `select count(*) from orders where idempotency_key is not null` went up by one.
- [ ] With the browser's network throttled (DevTools, "Slow 3G"), press "Submit order" once: the button stays disabled with "Submitting…" until the reply arrives.
- [ ] Place an order, then open New order again and place the same patient and tests: two orders (a new opening is a new key).
- [ ] In DevTools, find the `POST /api/orders` of an order just placed and send it again with its `Idempotency-Key` ("Copy as cURL", then run it): the answer is 200 with the same order id, the list still shows one order, and the API's log has `order.create_replayed` at warn with the order id and the key, and no second `order.created`. No line has a patient's name, date of birth or contact detail.
- [ ] The same request with `-H 'Idempotency-Key: not-a-key'` gives 400 `VALIDATION_ERROR` and places nothing; without the header it places a new order (201).
- [ ] Press "Submit order" on a throttled network: while "Submitting…" shows, Cancel is disabled, Escape (pressed several times) and a click outside the dialog do nothing, and the modal stays open. When the reply arrives it closes with the new order in the list.
- [ ] The timeout: in `docker compose exec db psql -U lab_orders lab_orders`, run `begin; lock table orders in share mode;`, then press "Submit order". The modal stays locked with "Submitting…" for 30 seconds, then shows "Can't reach the server. Try again." with Cancel enabled again. Run `commit;` in psql (the held request now places the order), then press "Submit order" again: the modal closes and the list shows that one order, not two.
- [ ] With the API stopped (Ctrl-C on `dev:api`), press "Submit order": "Can't reach the server. Try again." appears, Cancel and Escape close the modal again, and after restarting the API, "Submit order" in the same modal places one order.

### New order from the orders page and the patient page (LAB-20)

- [ ] The menu bar has no "New order" button on any page (orders, patients, a patient, new patient, catalog).
- [ ] On a patient's page, "New order for this patient" sits next to the Orders heading and opens the New order dialog with that patient's name and date of birth shown and the focus in "Add a test". "Change" shows the patient search and disables "Add a test"; picking another patient enables it again, and tests already added stay.
- [ ] Add CBC and press "Submit order": the dialog closes and the new order is first in the patient's Orders, with no reload. Open the dialog again and place the same tests: two orders (a new opening is a new key).
- [ ] On the Orders page, "Place new order" opens the dialog with no patient chosen and "Add a test" disabled ("Choose a patient first"), as before.
