# Independent review of the Lab Orders Lite build plan

Reviewer: an AI reviewer that took no part in the planning conversation. Read: the challenge brief, `lab-orders-process.md`, the plan index and all 23 tickets (LAB-01 to LAB-23), in full. Every finding quotes the text it rests on, or names the absence it rests on. Nothing in the plan was edited.

## Verdict

The plan is sound enough to start. The data model, the status rules, the error-code scheme, the price snapshot, the race-safe status change and the testing split are well reasoned and mostly specified to the level where they will work as written. Three things should be fixed in the tickets before LAB-01 begins:

1. **The idempotency key can return the wrong order as a success** (LAB-18, LAB-20). The key is deliberately kept when the user changes the patient or the tests after a failed submit, and the server never compares bodies. So a retry can silently "succeed" with the first order, for a different patient.
2. **A fresh clone will not start, and the test database is not wired up.** The plan loads `.env` with Node's `--env-file` flag, but no ticket creates `.env`, and Node exits when the file is missing. Separately, no ticket says how the integration tests find `lab_orders_test` when `DATABASE_URL` points at the development database.
3. **The README does not yet cover two things the brief asks for**: an architecture overview and a known-limitations section. Several tickets promise that limitations are "gathered in the README by LAB-22", but LAB-22 has no section for them.

The overall size (23 pull requests, each with docs, a process-log entry and an AI browser pass) is the biggest judgement call. It is defensible, but each ticket carries a lot of repeated ceremony, and the brief says "Keep it small but thoughtful".

Findings: **2 high, 5 medium, 9 low.**

---

## Findings, most severe first

### 1. High: a retried order can return a different order and report success

**Affected:** LAB-18, LAB-20 (and the process log's idempotency decision)

**The problem.** Three rules combine into a wrong result:
- LAB-18: "A replay returns the stored order as it was created, even if the body differs. Comparing the second body with the first is not done."
- LAB-18: "The same key is reused if the user retries after an error in the same modal session" and "A 200 reply is treated as success, the same as 201: the modal closes and the list refreshes."
- LAB-20: "It is kept while the modal stays open (including a change of patient and a failed submit)". An acceptance criterion even locks this in: "changing the patient inside one open modal does not" produce a new key.

**Scenario.** A user submits CBC for patient A. The server creates the order, but the response is lost (timeout, proxy 502), so the modal shows an error. The user notices the wrong patient, clicks "change", picks patient B and submits again. The same key goes out, the server finds it, returns patient A's order with 200, and the modal closes as if B's order were placed. B has no order, and A has an order nobody meant to place. The same happens if the user adds or removes a test before retrying.

**Why it matters.** The process log itself says "A wrong patient on an order is a safety issue". The plan calls this the "minimal, correct version", and an interviewer who probes it will find the hole quickly. LAB-18 lists "a replay with a different body is not detected" as a known limitation, but the UI then *creates* such replays on purpose.

**Recommended change.** Do both. Each is a few lines:
- **UI:** reuse the key only for an identical retry. Make a new key whenever the patient or the set of tests changes. Change the LAB-20 criterion and component test to say that changing the patient *does* produce a new key.
- **Server:** store a fingerprint with the key (patient id plus sorted test ids, as text or a hash). On a replay whose fingerprint differs, return 422 with a new code such as `IDEMPOTENCY_KEY_REUSED` instead of the old order. This removes limitation 3 from LAB-18 and leaves two (no expiry, no per-user scope).

### 2. High: on a fresh clone, `pnpm dev` stops before the app starts

**Affected:** LAB-01, LAB-02, LAB-04, LAB-22, LAB-23

**The problem.**
- LAB-02: "`.env` is loaded in development with Node's `--env-file` flag." and `DATABASE_URL` is "(required, a postgres URL)" with no default.
- LAB-01: "`.env` is ignored; `.env.example` is not." So a clone has no `.env`.
- LAB-23: "Clone the repo into a new empty folder with no `node_modules`, no `.env` … Each must succeed with no step that the README does not list." LAB-22's README setup is only "`pnpm install`, then `pnpm dev`".
- No ticket copies `.env.example` to `.env` (searched all tickets for this; none does).

I checked the flag on Node 22.21: `node --env-file=.env-missing -e …` prints `node: .env-missing: not found` and exits with code 9. So the reviewer's first `pnpm dev` fails before the config check ever runs.

**Why it matters.** "A working app we can run locally" is the first deliverable in the brief. LAB-04's fresh-clone criterion would probably catch this, but no ticket says what the fix is, so it gets improvised under time pressure.

**Recommended change.** Decide in LAB-02. Either (a) the `pnpm dev` script copies `.env.example` to `.env` when `.env` is missing and prints one line saying it did, or (b) use `--env-file-if-exists` (available in the pinned Node 22 line) and give `DATABASE_URL` a development default that matches `compose.yaml`. Option (a) keeps "the app refuses to start if a setting is missing" true. Add a LAB-02 criterion: "with no `.env`, `pnpm dev` still starts".

### 3. Medium: `pnpm test` does not say which database it uses, and could truncate the development database

**Affected:** LAB-02, LAB-03, LAB-05

**The problem.**
- LAB-02: config has one `DATABASE_URL`; the local `.env` points at the development database `lab_orders`.
- LAB-03: the harness "builds the app against `lab_orders_test` … truncates all tables except `schema_migrations` between test files". It does not say how it gets the test database's address. There is no `TEST_DATABASE_URL`, and no rule for deriving one (searched: `lab_orders_test` appears only in LAB-02 and LAB-03).
- LAB-05: in CI, "`DATABASE_URL` for the test database". So in CI the one variable means the test database, and locally it means the development database.
- LAB-02's `db:reset` and LAB-21's e2e setup both have a name guard ("does not end in `_e2e`"). The integration harness, which truncates every table, has none.
- LAB-03: "`pnpm test` runs unit and integration together; the database must be up." But the process log wants "the reviewer's first command [to be] quick and reliable", and LAB-21's `pnpm test:e2e` starts the container itself while `pnpm test` does not.

**Why it matters.** If the harness is built the obvious way (import `config.ts`), local test runs wipe the development data. A reviewer who runs `pnpm test` before `pnpm dev` gets connection errors.

**Recommended change.** In LAB-03, add a `TEST_DATABASE_URL` setting (in `.env.example`, defaulting to `lab_orders_test` on port 5433). The harness uses only that, and refuses to run unless the database name ends in `_test`. CI sets `TEST_DATABASE_URL` too. Make `pnpm test` start the container and wait for it, as `pnpm test:e2e` does, or have the README say to run `pnpm dev` (or `pnpm db:up`) first.

### 4. Medium: the README plan misses two things the brief asks for

**Affected:** LAB-22, plus LAB-07, LAB-09, LAB-18

**The problem.** The brief's README must include "Overview of your architecture/design decisions" and "Known limitations and what you'd improve with more time". LAB-22's required sections are "setup, scope, decision log, assumptions, deliberate cuts, AI usage, future versions, hours spent". There is no architecture overview (only a link to `docs/architecture.md`) and no known-limitations section. Meanwhile:
- LAB-07: "Two people editing the same test at once (last save wins): future version; gathered in the README by LAB-22."
- LAB-09: the same sentence for patients.
- LAB-18: idempotency limits are "gathered in the README by LAB-22".

LAB-22 has nowhere to put these. The "Deliberate cuts" list covers features left out, not weaknesses in what was built: last save wins, the duplicate-patient race, offset paging drift, idempotency limits, no paging on the patient list, and no holidays.

**Why it matters.** This is a graded line of the brief, and the plan already holds the content.

**Recommended change.** Add two README sections to LAB-22 and to its criterion: "Architecture in brief" (five to eight lines plus the one diagram, linking to `docs/architecture.md`) and "Known limitations" (gathered from every ticket's process entry, each with what you would do next).

### 5. Medium: two "New order" buttons on the orders page, and the browser tests can merge before them

**Affected:** LAB-20, LAB-21, plan index graph

**The problem.**
- LAB-20: the menu-bar button is "visible on every page (orders, patients, patient page, catalog)" and "The orders page keeps its New order button". So the orders page shows two buttons with the same accessible name.
- LAB-21 finds elements "by role and accessible name", and Journey 1 says "Click New order". Playwright's locators are strict, so with two matching buttons the click fails.
- LAB-21 depends on LAB-10, 13, 14 and 17, but not on LAB-18 or LAB-20. The graph allows LAB-21 to merge first, and LAB-20 to break it later. Because "Browser (Playwright) tests are not run in CI" (LAB-05), `main` would then be broken with nothing to flag it.

**Why it matters.** "`main` always works" is a stated rule, and this merge order quietly breaks it. Two identical buttons on one page are also an accessibility smell a grader may notice.

**Recommended change.** Drop the orders-page button in LAB-20, since the menu-bar button is already on that page. Otherwise, give the two buttons different accessible names. Make LAB-21 depend on LAB-18 and LAB-20, so the browser tests are written against the finished modal.

### 6. Medium: size and per-ticket ceremony against "keep it small"

**Affected:** all tickets; plan index; process log

**The problem.**
- The judge's earlier advice in the log: "15 hours was too much for 'keep it small'. Aim for roughly 7-9 hours of build plus the README". The later decision: "There is no deadline … the limit on scope is the brief's own 'keep it small but thoughtful'."
- Every vertical-slice ticket requires an "AI exploratory browser pass", a process-log slice entry and test entry, updates to four to six docs files, and a walkthrough. Five groundwork pull requests land before anything a user can see.
- The plan's own index says "The first point at which the brief's core is met … is after LAB-12. Everything from there on makes it better without being needed for it to work." That is 11 more tickets.
- LAB-01 moves all 23 ticket files (about 160 KB) into `docs/plan/` in the submission.

**Why it matters.** Each feature on its own is defensible: idempotency, the quote endpoint, the panel kept in the URL, the PR template and CI badge. Together, a grader may read them as breadth, the opposite of "a polished core". 160 KB of planning text in the repo also invites the question "how much of this did you write?". The candidate also has to explain all of it live.

**Recommended change.** Keep the scope, but cut the overhead. Options, for the candidate to choose from:
- Run the AI browser pass at three checkpoints (after LAB-12, after LAB-17, and in LAB-23), not in every ticket.
- Merge small neighbours: LAB-19 and LAB-20 (both UI-only patient-page work), and LAB-15 and LAB-16 (the panel and its first buttons).
- Submit `docs/plan/` as the index only, or move the tickets to a folder linked from the README, so the reviewer is not handed 23 files.

Also record the real hours. The log's "7-9 hours" figure will be compared with them.

### 7. Medium: "today" for date of birth has no timezone, so "tomorrow is rejected" depends on the time of day

**Affected:** LAB-08, LAB-09

**The problem.**
- LAB-08: date of birth must be "not after today, using pure `isRealDate` and a `today()` helper that returns a string". The helper lives in the shared schema, so it runs in both the browser and the server, and no timezone is named.
- LAB-08 database check: "`date_of_birth <= current_date`". `current_date` uses the Postgres server's timezone (UTC in the Docker image).
- LAB-08 criterion: "tomorrow's date … rejected"; and "The same invalid bodies sent directly to `POST /api/patients` return 400".

From 5 pm Denver time onward, UTC is already on the next day. A server `today()` in UTC (and the database check) will then accept "tomorrow", and the criterion fails in the evening only. Meanwhile the ready-date rule carefully uses `CLINIC_TIMEZONE`.

**Why it matters.** It produces a flaky test, and it is the same class of bug the log is proud of catching ("a date turned into a timestamp shows a day early").

**Recommended change.** Make the helper `today(timezone)`. The server passes `CLINIC_TIMEZONE` (the same source as the ready date), and the browser check is advisory. Keep the database check as a loose backstop, and say in `docs/data-model.md` that it runs in UTC. The unit test already injects today, which is good. Add one integration test with a fixed clock near midnight.

### 8. Low: the patient edit "transaction" does not stop the race it implies

**Affected:** LAB-09

**The problem.** "After applying the change to the stored patient, at least one of email or phone must remain; if not, 422 `CONTACT_REQUIRED` … The read and the update happen in one transaction." Explain question 5 asks "Why is the update done in one transaction with the read?". In Postgres's default isolation level, a plain read inside a transaction does not lock the row. Suppose two edits run at once, one clearing email and one clearing phone. Both pass the check. The second then hits the database CHECK constraint, which no ticket maps to an error code, so the user gets a 500 instead of the promised 422.

**Recommended change.** Read with `SELECT … FOR UPDATE`, or drop the read and map the check-constraint violation on that constraint to 422 `CONTACT_REQUIRED`. Either way, fix the explain answer so it is true.

### 9. Low: the status list will be written in four or five places

**Affected:** LAB-11, LAB-14, LAB-15, LAB-16, LAB-17

**The problem.** The statuses appear in: the database check, "check in (`ordered`, `collected`, `completed`, `cancelled`)" (LAB-11); the filter schema, "`status` (one of `ordered`, `collected`, `completed`, `cancelled`)" in `src/shared/` (LAB-14); the transition table in `src/server/orders/domain/` (LAB-15); the transitions body "`{ "to": "collected" | "completed" }`" (LAB-16); and the cancel CHECK (LAB-17). No ticket names a single exported list.

**Why it matters.** "Add a new status" is a likely change request. With no single source it touches about six files, and a missed one will show up live.

**Recommended change.** In LAB-11, export `ORDER_STATUSES` from `src/shared/`. The filter schema, the transitions `to` enum and the UI labels derive from it. Write the touch-list (migration, constant, table, labels) into `AGENTS.md`.

### 10. Low: the test seams the tests need are not designed anywhere

**Affected:** LAB-03, LAB-13, LAB-16

**The problem.**
- LAB-13 criterion: "Quote and create return identical `totalCents` and `estimatedReadyDate` for the same test list at the same injected time". This needs the running app to accept a clock.
- LAB-16: "change the stored status between the service's read and its update (an injected hook)".
- LAB-03 only says "`buildApp(deps)`", without saying what `deps` holds.

**Why it matters.** Without a decision, the first ticket to need a seam will improvise one. A test-only hook inside the order service is also something the candidate will have to defend.

**Recommended change.** In LAB-03, state that `deps` is `{ pool, clock, logger }`, with `clock: () => Date`. For LAB-16, prefer a test that calls the repository's conditional update with a stale "previous" status over a hook in production code. That proves the same thing with no seam.

### 11. Low: the price snapshot is tested twice

**Affected:** LAB-12, LAB-15

**The problem.** LAB-12 integration: "price change after ordering (done by direct SQL in the test)". LAB-15 integration: "frozen price survives a catalog price change". The plan's rule is "Tests for the new behaviour are written in the same pull request, each rule tested in one layer only", and in spirit, once.

**Recommended change.** LAB-12 owns the rule. LAB-15 asserts only that items come from the `order_items` columns, which its shape test already covers. Drop the second price-change test.

### 12. Low: documentation inconsistencies that a grader or LAB-22 will trip on

**Affected:** LAB-01, LAB-05, LAB-22, `lab-orders-process.md`

- **LAB-22's own criterion fails on purpose-written text.** It requires that "A search of README.md and `docs/` finds … no `resulted`, `VALIDATION_FAILED` …". But `docs/process.md` correctly records "the AI proposed `resulted`", and `docs/plan/tasks/LAB-22…` contains both words. A search confirmed both files. Fix: exclude `docs/process.md` and `docs/plan/` from that search.
- **The index file name.** LAB-01 and LAB-05 update "Status table in `docs/plan/index.md`", but the index is `README.md` today, and LAB-01 moves it "unchanged in content". Pick one name.
- **The process log says the ready date is derived.** Under Future versions §6: "the total and ready date recalculated. Because both are derived from the order items, they would update on their own." The decision table says the ready date "is calculated once at order time and stored". LAB-22 copies Future versions into the README, so fix it before then.
- **A stale open question.** The log still says "_Open: whether the catalog's turnaround unit becomes whole business days instead of hours._", but the decision table settles it ("The catalog stores turnaround in whole business days").
- **Three layers or four.** The log says "all three layers" (unit, integration, end to end), but the plan adds a fourth, component tests (LAB-04 onward, about 20 of them). The log's "Rough count" for integration is "~12-15", and the tickets add well over 50. Update the table so the README's testing story matches the code.

### 13. Low: two different seed-idempotency mechanisms, one of them unspecified

**Affected:** LAB-04, LAB-06, LAB-08, LAB-11

**The problem.** LAB-04: the seed runs "only if the database is empty (the seed script checks for existing rows in the tables it seeds)". LAB-06: "inserts with `on conflict (code) do nothing` so it can run twice". LAB-08: patients are "Repeatable without copies", and LAB-11: "Running the seed twice leaves exactly 4 orders". Patients and orders have no natural unique key, so no ticket says how they avoid copies.

**Recommended change.** One mechanism: fixed UUIDs for every seeded row, with `on conflict (id) do nothing` per table. Then `pnpm dev` can always run the seed, and new seed rows from a later ticket reach an existing development database. With the "only if empty" check, they would not.

### 14. Low: created time and ready date use different timezones on screen

**Affected:** LAB-11, LAB-15

**The problem.** The ready date uses "the calendar day of `orderedAt` in `CLINIC_TIMEZONE`" (default `America/Denver`). Nothing says which timezone the "created time" column uses, so it will use the browser's. A grader outside Mountain time can place an order at "Fri 11:30 PM" local time, see a ready date computed as if it were placed on Saturday, and think the rule is wrong.

**Recommended change.** Show created time in the clinic timezone (the API can return the clinic date alongside `createdAt`), or label the column with the timezone. Mention the default timezone in the README setup.

### 15. Low: LAB-13 defines its shape by pointing at a ticket it does not depend on

**Affected:** LAB-13, LAB-15

**The problem.** LAB-13 returns items "with the same item field names as `GET /api/orders/:id`", which LAB-15 builds. LAB-13 depends only on LAB-12, and the index places LAB-13 and LAB-15 on the same line, so either can merge first.

**Recommended change.** Define the order-item response schema once in `src/shared/` in LAB-12 or LAB-13, and have LAB-15 reuse it. Reword both tickets to say so.

### 16. Low: CI arrives after three groundwork pull requests

**Affected:** LAB-05

**The problem.** LAB-05 "Depends on: LAB-04". LAB-02, LAB-03 and LAB-04 merge with "Until then the checks run by hand" (LAB-01). Those are the pull requests with the trickiest setup (database, harness, `pnpm dev`).

**Recommended change.** This is optional. CI could follow LAB-01 with lint, typecheck and test, and gain its Postgres service in LAB-03. It is cheap, and it makes "`main` always works" true from the second merge. If the order stays as it is, nothing breaks; this is a nicety.

---

## Checked and found sound

- **Status rules and race safety (LAB-15 to LAB-17).** One transition table. The read → check → conditional `UPDATE … WHERE status = $previous` flow gives 404, 422 and 409 cleanly, and the lost-race test is deterministic. Cancel uses the same table, and a CHECK constraint ties the three cancellation columns to the `cancelled` status. Existing rows cannot violate it, because LAB-14 forbids leaving cancelled rows in the development database.
- **Price snapshot and money.** Order items copy code, name, price and turnaround inside the create transaction. Money is integer cents, with string-based dollar parsing (`parseDollarsToCents`, no floats). The total is derived through one `calculateTotal`. The ready date is stored and read once from an injected `now`.
- **Ready-date rule (LAB-11).** The weekend rules, "order day does not count" and the clinic-timezone day boundary are all specified with concrete examples. The function is pure and unit-tested in one place. Holidays would be one extra parameter, so that live change is easy.
- **Date of birth.** The `DATE` type parser returns `YYYY-MM-DD` strings, `formatDate` never builds a `Date`, real-date validation includes leap years, and the round-trip is tested under a non-UTC timezone.
- **Duplicate-patient check (LAB-10).** The three exact rules match the decision log. A pure `matchRules` with one candidate query; the check warns and never blocks; an invalid body takes precedence over a duplicate; the accepted race is documented.
- **Idempotent create on the server side (LAB-18).** `ON CONFLICT DO NOTHING` inside the transaction, with a plain unique index (Postgres allows repeated nulls in one), is correct for same-key concurrency. Only the UI key policy and the missing body comparison are wrong (finding 1).
- **Error model (LAB-03).** One error shape, a registry of upper-case codes, a consistent 400/404/409/422 split (ids in the body give 422, ids in the path give 404), generic 500s, and a request id in both the logs and the responses. No bodies, query strings or personal data in logs.
- **Catalog.** The code is unique (by constraint, with no check-then-insert) and immutable (strict update schema). Tests are deactivated, never deleted, and inactive tests are rejected on new orders.
- **Paging (LAB-14).** `limit + 1` with no COUNT, a stable `id` tie-break, and indexes that match the three filter shapes.
- **Most dependencies.** Apart from findings 5 and 15, I found no merge order the graph allows that leaves `main` broken. No ticket assumes something that an earlier ticket in its dependency chain does not build.
- **Brief coverage.** Patients (create/update), catalog (code, name, price, turnaround), multi-test orders, total, estimated ready date, list with patient and status filters, tests in three or more layers, and the README trade-offs are all covered.

## Questions only the candidate can answer

1. **Idempotency policy (finding 1).** Do you want both fixes (a new key when the content changes, plus a server-side fingerprint check), or only the UI change, keeping "different body not detected" as a documented limit?
2. **Per-slice AI browser pass and the in-repo plan (finding 6).** You chose both. Do you still want the browser pass on every ticket, and all 23 ticket files in the submitted repo, given the size concern?
3. **Duplicate New order button (finding 5).** Remove the orders-page button, or keep both under different names?
