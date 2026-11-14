# LAB-21: Browser tests for the main journeys

- **Status:** Not started
- **Type:** Hardening
- **Depends on:** LAB-10 (Patients: duplicate warning on create), LAB-13 (Orders: live total and ready date while building an order), LAB-14 (Orders: filter the list by status and patient), LAB-17 (Orders: cancel an order with a note and a name), LAB-18 (Orders: a double-click or retry cannot create a duplicate order), LAB-20 (New order from the menu bar and the patient page)
- **Unblocks:** LAB-22 (Docs and README, final pass)
- **Branch:** `lab-21-browser-journeys`

## Description

This task adds the end-to-end kind of test, the top of the test pyramid above unit, component and integration tests: three browser tests that click through the real app, backed by the real API and a real Postgres. After this task, `pnpm test:e2e` runs the three main journeys on a freshly reset and seeded database.

The rules are already proved by the unit and integration layers. This layer only proves that the screens, the API and the database work together, so it holds very few tests. They run locally only: there is no CI job for them.

## Requirements

**Tooling**
- Add `@playwright/test` as a dev dependency. Chromium only. The one-time browser download is `pnpm exec playwright install chromium`.
- `pnpm test:e2e` starts the database container from the compose file and waits for it, then runs Playwright. `pnpm test` neither runs nor requires Playwright or a browser.
- `playwright.config.ts` at the root: `testDir: e2e/`, one worker, `retries: 0`, `webServer` entries that run the dev servers (API and web) on test ports 3101 and 5174.
- The tests use a database named `lab_orders_e2e`. A global setup creates it if it is missing, runs the migrations, truncates all tables, and loads the seed (CBC, CMP, LIPID, A1C, TSH, UA, VITD, CULT and the fake patients). It stops with a clear message, and touches nothing, if the database name in use does not end in `_e2e`.
- Each journey creates its own data with unique names and does not depend on the order the journeys run in.
- No `page.clock`. No assertion on a specific calendar date.
- Elements are found by role and accessible name, matched exactly (the names "Place new order" and "New order for this patient" are different buttons; there is no "New order" button in the menu bar). Where a role is not enough, use `data-testid`, and list each one in `docs/testing.md`.

**Journey 1: place an order and find it**
1. Go to Patients and create a new patient with unique fake details.
2. Click "Place new order" on the orders page (the orders-page button), choose that patient, and use quick-add to add `CBC` and `LIPID`.
3. Read the total and the ready date shown in the modal preview.
4. Click "Submit order". The order shows on the home list. Filter by that patient and by status "ordered". Check the row's total and ready date equal the modal preview's.
5. Open the row. Check the panel shows both tests, and the same total and ready date.

**Journey 2: duplicate warning**
1. Start a new patient with the same first name, last name and date of birth as a seeded patient.
2. Submit. The warning lists the existing patient with name, date of birth, email and phone.
3. Open the existing patient from the warning. Check that patient's page opens, and that the patients list still shows exactly one patient with that name.

**Journey 3: collect, then cancel**
1. Place an order for a seeded patient through `POST /api/orders` (set-up speed; the test says so in a comment).
2. Open it in the panel and press the next-status button: the status changes from ordered to collected.
3. Cancel with an empty note: the form shows an error and the status stays collected. Cancel with a note and a name: the panel shows cancelled, the note, the name and the cancelled-at time, and no status buttons remain.

**Logging**
- None. The server's log output goes to the terminal while the tests run.

## Acceptance criteria

- [ ] After `pnpm install` and the one-time browser download, `pnpm test:e2e` passes all three journeys with no other manual step.
- [ ] `pnpm test:e2e` finishes in under 120 seconds, as reported by Playwright's total run time.
- [ ] Running `pnpm test:e2e` twice in a row passes both times.
- [ ] `pnpm test` runs no browser and still passes.
- [ ] With the e2e database name changed to one that does not end in `_e2e`, the setup stops with a message and no table is truncated.
- [ ] Journey 1 fails when the list row's ready date is made to differ from the modal preview's (checked once by hand-editing the date shown in the list).
- [ ] Journey 2 fails if the warning does not appear, and asserts that no second patient with that name exists.
- [ ] Journey 3 fails if the cancel form accepts an empty note.
- [ ] No test uses `waitForTimeout` or `page.clock`; a search of `e2e/` finds neither.
- [ ] The docs/process.md slice log entry and test log entry for this task were written in the same pull request.

## Tests

- **e2e (this task adds exactly these):**
  - `journey-1: create patient, place two-test order, preview matches list and panel`
  - `journey-2: duplicate patient warning, open existing patient, no new patient created`
  - `journey-3: advance to collected, empty note refused, cancel with note and name`
- **Unit and integration:** none. A rule that a journey finds untested gets its test in the layer that owns it, in its own branch.
- The date rule is unit-tested in LAB-11. The e2e layer checks only that the three screens agree.

## Docs to update

- `docs/testing.md`: the four kinds of test (unit, component, integration, end to end), what each proves, how to run each, the one-layer-per-rule principle, the `data-testid` list, and a "Deliberately not tested" section: every validation message, ready-date edge cases, cross-browser and mobile layouts, accessibility audits, load, and the crash fallback screen (the crash fallback screen is not tested in a real browser; it is covered by a LAB-04 component test), each with a reason.
- `docs/acceptance-checklist.md`: mark which checks the journeys also cover.
- `AGENTS.md`: how to run e2e, where the seed lives, and that e2e tests stay at three journeys unless a bug can be reproduced only in a browser (LAB-23).
- docs/process.md: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.

## Out of scope

- A CI job for e2e, CI retries, and CI artifacts: future version. The unit and integration tests gate every pull request (LAB-05).
- The full acceptance-checklist run and the AI exploratory pass over the whole app: Checkpoint 3, in LAB-23. (Checkpoints 1 and 2 run earlier: Checkpoint 1 once LAB-04 and LAB-06 to LAB-12 have merged, Checkpoint 2 once LAB-13 to LAB-17 have merged.)
- More journeys (catalog editing, patient search): their rules are tested in LAB-06 to LAB-09.
- Cross-browser runs and visual regression: future version.

## What to be able to explain

1. Why are there only three browser tests, and what does each prove that the other layers cannot?
2. How does the setup guarantee a clean database, and what stops it from wiping the wrong one?
3. Why does Journey 1 compare three screens and not assert a calendar date?
4. Why do the e2e tests run the dev servers on separate ports and a separate database?
5. Why does e2e run locally only and not on every pull request?
