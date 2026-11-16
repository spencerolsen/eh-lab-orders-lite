# Backlog: not done, and why

Things that were found and deliberately not done, grouped by theme. Each line says what it is and why it was left. Anything that has since been fixed is not here. The user-facing limits are also summarised in the [README](../../README.md#known-limits).

## Orders: concurrency, create and idempotency

| Item | Why it was not done |
|---|---|
| A screen that is out of date (a second tab still showing `ordered` after the first marked the order collected) gets 422 `ILLEGAL_TRANSITION`, not 409 `ORDER_CHANGED`. The panel reloads, so the user sees the real status under the message. | Accepted for this version: 409 stays for a change that lands between the request's read and its update. The alternative is for the client to send the status it saw (`{ "to", "from" }`), and the server answers 409 when the status it reads differs. That changes the request body and every caller. |
| An idempotency key never expires, so the key column only grows. | Harmless at a clinic's volume. The fix is a cutoff for replays and a job that clears old keys. |
| An idempotency key is not scoped per user: any client that sends a used key gets that order back. | There are no users yet. With login, the unique index becomes (user, key). |
| A replay with a different body is not detected. After a failed submit that in fact placed the order, changing the patient or tests in the same open dialog and submitting again returns the first order as a success. | Rare (the first attempt must have succeeded while its reply was lost). The fix is a new key whenever the dialog's content changes, plus a fingerprint of the body stored with the key and a 422 when a reused key comes with a different one. |
| While a submit is in flight the dialog's contents can still change: the patient picker, quick-add, Remove and Change stay enabled, a fast double click sends two POSTs a millisecond apart (one order, because the same key answers both), and the Escape guard has a gap of a few milliseconds after Submit. Two click events in the same tick on the New patient form can create two patients. | The server does its job in every case. A `<fieldset disabled>` around the fields and a ref set in the submit handler would close the gaps; they are tidiness, not correctness. |
| If a test's price or turnaround changes while the New order dialog is open, the order is saved with the server's current numbers, which can differ from the preview. | Documented in `docs/api.md`. The fuller fix: the dialog sends the previewed total and ready date, and the server answers 409 with the new numbers if they differ, for the person to confirm. |
| The client gives up after 30 seconds, but the server has no statement timeout, so a held create can still commit later. | Intended and documented: the retry with the same key returns that order. A server-side `statement_timeout` would bound it. |
| A database stall longer than 5 seconds turns requests queued for a pool connection into 500s (`connectionTimeoutMillis`). | Pre-existing. With a key, a retry of a create is safe and returns the order. |
| A replay that loses a same-key race reads the catalog `FOR SHARE` and logs `order.ready_date_estimated` for an order it does not create. | Rare and harmless. A key already committed is answered by the lookup at the top of the transaction. |
| `findOrderIdByIdempotencyKey` followed by `findOrderListItem` is two reads where one query would do. | Reusing the one list-row query is easier to explain, and replays are rare. |
| The 201 of `POST /api/orders` reads the new order back with one more query. | Kept for clarity: the reply is exactly what the list shows, through the one row mapper. |
| The cancel-against-transition race test accepts either winner and covers only `ordered` to `collected`. | Running it over both moves would be cheap, but which winner a run exercises is still chance. |
| The test that status-change logs hold no patient detail reads the whole file's log, so the lost-race line is covered only because the overlap test runs earlier in that file. | Covered today. The same assertion in `transition-lost-race.integration.test.ts` would make it independent of test order. |
| `order.ready_date_estimated` is logged at debug even when the order is then refused for an unknown patient. | Debug only, ids and counts only. Moving the line after the insert splits the rule's code from its log line for little gain. |
| `AGENTS.md` says logs never carry headers, but `order.create_replayed` carries the `Idempotency-Key` value, by owner decision (a random id, not patient data). | A one-line exception in `AGENTS.md` would remove the apparent contradiction. |

## Orders: list, detail and the total

| Item | Why it was not done |
|---|---|
| Sorting the orders list by status or by patient has no index, so each page may read every matching order (the patient sort also joins `patients` inside the page cut). Tests and Total cannot be sorted at all. | Fine at a clinic's volume. The fix is a stored, indexed sort key (a lower-cased name column, a status rank), or keyset paging on the sort key; Total would need a stored total, which the design avoids on purpose (LAB-26). |
| Sorting by a column does not break ties by newest first: orders with an equal value (the same status, say) come back by `id`, which looks arbitrary. | The owner decision was the unique `id` tie-breaker only. A secondary `created_at desc` before it would read better but is a second rule to keep in the index plan. |
| `cancelled_at` and `updated_at` are set with the database's `now()`, while `created_at` uses the injected clock. | A test cannot fix those two times. Passing the clock's time into the two updates would make them consistent. |
| The orders list's column list is written twice in `orders/repo.ts`: once in `LIST_ROW_SELECT` (one order) and once in the paged query (the page is cut first, then joined). | The two shapes differ on purpose, but a new filter or column has to touch both. |
| Offset paging can repeat or skip an order when orders are created or cancelled between two pages. The screen drops a repeated row, but a skipped one stays missing until the list is reloaded. A total count would be a separate request. | Accepted: a clinic's list is short and read by a few staff. Cursor (keyset) paging on (`created_at`, `id`) is the fix. See `docs/architecture.md`, "Scaling the orders list". |
| Nothing stops the browser or a route from doing its own total or ready-date arithmetic (a sum that gives the same number today). The rule is held by convention and review, and nothing enforces that the total has one implementation. | It would drift only if `calculateTotal` changes (for example discounts). A lint or import rule, or a unit test that stubs `calculateTotal`, would guard it. |
| `estimateReadyDate` has no upper bound on a turnaround: it steps one day at a time, so an absurd value (about 1e9) would take about 30 seconds. | The catalog caps turnarounds at 1 to 365, in the schema and the database, so no such value reaches it. Refusing `turnaroundDays > MAX_TURNAROUND_DAYS` with the same `RangeError` would close it. |
| `order_items.turnaround_days` checks only `>= 1`, while `lab_tests` checks 1 to 365. | Items are copied from the catalog, which already enforces the range. Mirroring it is one migration line. |
| The order list response schema takes `dateOfBirth`, `estimatedReadyDate` and `createdAtClinic` as any string. | The server builds them from date columns and `clinicDateTime`, so they are always well formed. A regex in the schema would make the contract say so. |
| On the day the clocks go back (Denver, 2026-11-01), two different instants both show as 1:30 am under "Created (America/Denver)". | Correct but ambiguous for one hour a year. Showing the offset would settle it. |
| `GET /api/orders/<UPPERCASE-UUID>` returns 200 and logs the id as typed. | Harmless: uuids compare case-insensitively and the id is not patient detail. |
| `labTestIds` has no maximum length. | The 1 MiB body limit bounds it. A `.max(50)` is a product decision on the largest order. |
| In a quote refusal, `details` positions (`labTestIds.N`) refer to the sorted id list the modal sends, not the user's order. | The modal does not show them, so there is no impact today. |
| The `order.ready_date_estimated` debug line also carries `longestTurnaroundDays` and `estimatedReadyDate`, where the LAB-13 ticket says item count only. | Harmless (no patient data) and the docs list the fields. |
| No test asserts the quote's own log lines (level, or that no test name or patient detail appears). | The real logs were checked by hand, and the create log test covers the shared helper. |
| A shared `?order=<id>` link for another patient's order opens its panel on this patient's page. | By design: the panel loads any order by id and the address is a shareable link. |
| `orderTransitionBody` excludes `ordered` and `cancelled` by name instead of deriving the targets from the transition table, which `src/shared` cannot import. The panel casts `to as OrderTransitionBody['to']` when sending a move. | The table still decides every move on the server. A narrower type for `allowedNextStatuses` in the shared schema would remove the cast. |
| After a status change the panel puts the server's answer into `['orders', id]` and then invalidates `['orders']`, which refetches that same order: one redundant GET per change. | Harmless. Invalidating only the list query (`exact: true`) would drop it. |
| Cancelled orders: a CHECK that uses `btrim` removes spaces only, so direct SQL can store a note of tabs or line breaks alone, and direct SQL can change the note or name of an order that is already cancelled. The API does neither. | `cancellation_note ~ '\S'` (and the same for `cancelled_by`) in a new migration would harden the first; a trigger would close the second. Neither was asked for. |

## Patients

| Item | Why it was not done |
|---|---|
| The duplicate check is exact: names that differ by an accent (`Zoe` and `Zoë`), a nickname (`Jon` and `John`) or a typo do not match. A letter written as one character or as a letter plus a combining accent does not match either. Ignoring case uses Postgres `lower()` to find candidates and JavaScript `toLowerCase()` to decide, which differ for a few letters (Greek final sigma, Turkish dotted I). | Exact rules are explainable and testable. Fuzzy matching (`unaccent`, Unicode normalization with `normalize('NFC')`, nicknames, AI-assisted matching) is on the future list. |
| Two identical creates sent at the same moment can both pass the duplicate check and both create a patient. | The check warns, it does not guarantee. A lock or a unique constraint would turn the warning into a block, the opposite of the rule: two real people may share every compared value. |
| The 409 `POSSIBLE_DUPLICATE` returns other patients' names, dates of birth, emails and phones to whoever creates a patient. | There is no login, so every user may see every patient anyway. With logins the matches would need a permission check. |
| With exactly 10 matches listed, the warning says "10 existing patients" even when more exist. There is no fake-database unit test of the service with 12 matching rows. | Cosmetic: the user sees the closest matches either way, and the log has the true count. The integration test `lists at most 10 matches` checks both against the real database. |
| Search is not accent-insensitive: `zoe` does not find Zoë. | Needs the `unaccent` extension (and an immutable wrapper to index it). A trigram index goes with it if the table grows. |
| The search length limit counts UTF-16 units, not characters: 60 emoji are refused while 100 `é` pass. | Harmless: the limit only keeps a search short. Counting code points would be a custom check. |
| `?q=a&q=b` is refused with the reason "must be text"; "must be given once" would be clearer. | Still a correct 400, and the app's pages never send `q` twice. |
| A name made only of invisible characters (a zero-width space) is accepted, and so is a cancel note or name made only of them, because `trim` does not treat them as whitespace. | Rare, harmless to store, and not something a person types by accident. Refusing it means deciding which Unicode format characters count as blank. |
| Two people editing the same patient or the same lab test: the last save wins, silently. | Accepted: a handful of staff edit rarely. The fix is optimistic locking: send the `updated_at` (or a version number) that was loaded, and answer 409 when the row has changed. |
| The patient list without a search (`GET /api/patients`) is not paged or capped, and the Patients page loads it whole. | A clinic's patient list is short. Paging or a cap goes with the first need for it. |
| Only US phone numbers with an area code are accepted. | The clinic's patients have US numbers. Other countries would need the country code kept and a different length rule and display. |

## Catalog

| Item | Why it was not done |
|---|---|
| The database does not check a lab test code's format or length, or a name's length; it accepts an untrimmed ` DB8 ` or a 300-character name written by direct SQL. | The API is the only writer and its schema enforces both. The database keeps the checks that protect data the rest of the app relies on. |
| Upper-casing a code expands some letters (`ß` becomes `SS`), so `ßX` is stored as `SSX` instead of being refused. | Harmless: the stored code still matches the format and is unique. Checking the format before upper-casing would refuse such input. |
| "This code already exists" stays under the Code field while the user edits it, until the next submit. A failed Activate or Deactivate leaves its message above the table until the next toggle. | The messages stay true until the user retries. Clearing them on change is small polish. |
| The test that lab test updates log no request values searches the log text for the sent name and the key `priceCents`, so a value logged under another key would pass. | The test catches the realistic mistake. Checking that `lab_test.updated` has exactly the expected keys would be stricter. |
| The two `centsToDollarsText` test blocks overlap. | Harmless duplication in tests. |
| The catalog list (`GET /api/lab-tests`) is not paged: it returns every test, and the catalog page and quick-add load it whole. | A catalog of a few dozen tests is the expected size. Paging or a search goes with the first need for it. |
| Three styles of Postgres error detection: `violates()` in `orders/repo.ts`, `instanceof pg.DatabaseError` in `patients/repo.ts` and `isCodeTaken` in `catalog/repo.ts`. And `catalogRoutes(app, pool)` takes the pool while the other route functions take `(app, deps)`. | All work and are tested. One shared helper and one signature would be tidier. |

## Web screens: keyboard, focus and messages

| Item | Why it was not done |
|---|---|
| Focus is not always returned to the control that opened something. It drops to the page body after: choosing a patient in the orders filter, "Remove patient filter", "Keep order", Escape on the New order dialog opened from the patient page, closing a panel opened by a direct load, Escape on a deep-linked panel (nothing opened it), and Save or Cancel in the lab test edit form. After a failed submit, focus sits on the dialog itself. | Everything still works by keyboard. Moving focus to the opener, the status select, the error message or the row is an accessibility polish. |
| "Keep order" stays enabled while a cancel request is in flight: it closes the form while the cancel still lands. | Harmless (the success still shows), but it can look like the cancel was abandoned. Disable it while sending. |
| Field errors in the cancel form stay after the person fixes the field, until the next submit. | Clearing each on edit is small polish. |
| Typed New order dialog content is discarded on Escape without a warning. | Acceptable for a small clinic. |
| Escape inside the open cancel form closes the whole order panel and drops the typed note and name. | Nothing was sent, so nothing is lost but typing. Closing only the form on the first Escape is polish. |
| An unknown or invalid `status`, `patientId` or `limit` in the orders page address is ignored without a message, and the full list shows. | Harmless: the page only builds valid addresses itself. A one-line notice would say what was dropped. |
| ArrowUp with nothing highlighted highlights the first suggestion even while the list is closed. | Harmless: typing resets it, and the list is not shown. |
| Quick-add shows nothing when no test matches what was typed. | A "No tests match" hint would help. |
| After Change, the patient search box starts empty. | Keeping the last search text would save typing. |
| Every View button on the patient page is labelled "View order for" plus the same patient name, so a screen reader hears the same label on every row. | `OrdersTable` could label by created time when `showPatient` is false. |
| The `?order=` parameter stays in the address for a few hundred milliseconds after Escape. | Not a bug: the browser fires the close event late. |
| No test goes from one patient's page to another's and checks that only the second patient's orders show. | The code is correct (checked by hand), but showing one patient's orders on another's page is the worst failure this screen could have, so a test with two fake lists would be cheap insurance. |
| A test with a fake API that repeats a row on page 2, to pin the list's duplicate-row filter. | The filter is small and the repeat is a documented limit. |
| `onSuccess` in `OrderDetailPanel` clears the error a second time after `onMutate` already did. | Harmless; one line could go. |
| Two click events in the same tick on Save create two patients (a script can; a person cannot). | The Save button's disabled state comes one render late; a ref set in the handler would close it. |
| The Escape guard in the New order dialog has a gap of a few milliseconds after Submit, because it is installed in an effect after the pending render. | A person cannot hit it; a ref set in the submit handler would close it. |

## Look and layout

| Item | Why it was not done |
|---|---|
| The global `input` rule also pads and borders checkboxes and radios. | No page uses one. The first that does adds `input:not([type='checkbox'], [type='radio'])`. |
| An `ordered` badge inside a hovered table row is tint on tint, so its pill edge disappears (the word stays readable). | Cosmetic, and the status word is always shown. |
| The menu bar overflows below desktop width (at 375 px "Catalog" is cut off and the page scrolls sideways). | Desktop only (1024 px and wider) is the stated scope. |
| The footer text sits at the window's left edge while the page content is centred. | Cosmetic. |
| At 1024 wide the orders table's patient column is the squeezed one. | Fine as is. |
| The suggestions in quick-add sit in the page flow and push the chosen-tests table down. | Works and is readable. A floating list is a look decision. |

## Setup, tooling and tests

| Item | Why it was not done |
|---|---|
| `pnpm audit` reports one moderate advisory (minimatch, reached through eslint). | Dev-only: it is not in the built app or the server. It goes when eslint's own dependency is bumped. |
| `pnpm test:e2e` prints a transient Vite proxy error (`/healthz`, connection refused) while it waits for the API to start. | Harmless: the run waits and passes. Waiting on the API before starting Vite would hide it. |
| Two component tests (`App.test.tsx`, `MenuBar.test.tsx`) assert `toBeTruthy()` on `getBy*` results. `getBy*` already throws when nothing matches, so the assertion cannot fail by itself. | They still prove the element is found. `toBeInTheDocument()` or a query that returns null would say it better. |
| `cancel-uses-table.integration.test.ts` changes the shared `TRANSITIONS` table through a cast and restores it. | It is how the test proves cancelling reads the table. A table passed in as a parameter would avoid the mutation. |
| `src/server/orders/fixtures.ts` (SQL used only by tests) sits in the source tree. | It is shared by several test files. A `testing/` folder is where it would live. |
| Node-level 400 and 431 responses (headers over 16 KB, a body shorter than its `content-length`) are answered before the app sees them, outside the standard error shape and with no request id. | Documented in `docs/api.md`: the app's own clients never send such requests. |
| An already-applied migration file that is edited later is ignored without a warning. | The rule is documented in `AGENTS.md`. Storing and comparing a checksum of each applied file would be the fix. |
| No automated test checks that the `pnpm dev` steps run in order and that the Vite proxy reaches the API. | Covered by the manual checklist and by the browser tests, which run against the real dev setup. |
| Browser tests do not run in the automated checks on pull requests. | Deliberate: they are the slowest and most fragile layer, so they run locally with `pnpm test:e2e`. |
| When `pnpm test` stops on a database port mismatch, the one-line message is surrounded by Vitest's own "No test files found" output. | The message is clear and names the setting. Making it the only output means more code than the gain. |
| A non-numeric `DB_PORT` is reported as a mismatch with the URLs' port, not as "must be a whole number". | It still stops before anything starts and names `DB_PORT`. |
| A client-chosen `x-request-id` header is logged as sent (when it is 1 to 64 safe characters). | It is the caller's own text, not data the app stores. |
| Vitest prints an "Isolate ... workers spawned" notice on every run. | Harmless. Silencing it means changing the pool settings for every project. |
| Running `playwright test` directly prints a stack trace instead of a short message. | Catching it in `playwright.config.ts` and printing one line is polish. |
| `scripts/e2e.ts` runs Playwright with `spawnSync`, which blocks its own Ctrl-C handler until Playwright exits. | Works because Ctrl-C also reaches Playwright. A comment would explain it. |
| The double-click browser journey passes because of the idempotency key, not only the disabled button. | Renaming it "a double click or a retry creates exactly one order" would say so. |
| The browser tests hard-code seed prices (`$63.00`, `$25.00`, `$18.00`). | A seed price change breaks three tests. A comment would say so. |
| Docker Compose output is printed twice by `pnpm dev`. | Cosmetic. |
| The acceptance checklist's curl lines use port 3000, the default `PORT`, and it has no section for the polish pass. | A second copy uses its own `PORT`. The checklist is for the default setup. |
| A few comments were left unwrapped after edits (`service.ts` line 2, the order panel's opening comment, `orders/routes.ts`). | No behaviour change. |
| `docs/plan/README.md` ordering ("8. LAB-17, LAB-20") and the LAB-20 file name `new-order-entry-points` still say "entry points" while the title says "patient page". | Fine as is. A rename would break links for no gain. |
| LAB-20 ticks its acceptance boxes `[x]`, while LAB-12 to LAB-19 are Done with every box still `[ ]`. | One convention is wanted; not decided. |
| The acceptance checklist has no section for the LAB-25 polish (panel heading, select arrow, New order dialog scroll), and its "Try again" step is long ("or use a throttled/blocked request"). | Optional for a polish ticket; the step is correct and usable, and shortening it is wording only. |
| `service.ts` imports `./domain/total` before `./domain/ready-date`; alphabetical order would be tidier. | Cosmetic; lint passes. |
| The LAB-17 ticket lists the `cancellation` fields without `cancelledAtClinic`, which `docs/api.md` has; the LAB-18 ticket says a replay returns the order "as it was created" (it returns it as stored now) and that the disabled Submit button is checked only by the checklist (a component test now checks it). | Wording only: the tickets are a record of the plan, and `docs/api.md` is the source of truth. |
| The ready-date unit test that compares with an independent calculation for every day from 2020 to 2031 uses only turnarounds 1 and 4 and the UTC zone. | The worked examples cover longer spans and other zones. Adding 5, 10 and a non-UTC zone to the sweep is cheap but slows the unit run. |
