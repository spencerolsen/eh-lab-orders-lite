# LAB-21: Browser tests for the main journeys

- **Status:** Done
- **Type:** Hardening
- **Depends on:** LAB-10 (Patients: duplicate warning on create), LAB-13 (Orders: live total and ready date while building an order), LAB-14 (Orders: filter the list by status and patient), LAB-17 (Orders: cancel an order with a note and a name), LAB-18 (Orders: a double-click or retry cannot create a duplicate order), LAB-20 (New order from the patient page)
- **Unblocks:** LAB-22 (Docs and README, final pass)
- **Branch:** `lab-21-browser-journeys`

## Description

This task adds the end-to-end kind of test, the top of the test pyramid above unit, component and integration tests: a few short browser tests that click through the real app, backed by the real API and a real Postgres. After this task, `pnpm test:e2e` runs the main journeys on a freshly reset and seeded database, with one command.

The rules are already proved by the unit, component and integration layers. This layer only proves that the screens, the API and the database work together, so it holds few tests. They run locally only: there is no CI job for them.

## Requirements

**Tooling**

- `@playwright/test` is a dev dependency (exact version). Chromium only. The one-time browser download is `pnpm exec playwright install chromium`.
- `pnpm test:e2e` is the only command (`scripts/e2e.ts`). It starts the database container and waits for it, resets and seeds its own database, starts the API and the web app itself on `PORT` and `WEB_PORT` from the settings (never hard-coded, never reusing a server already there), runs Playwright, and stops what it started. It stops with one line if Docker is not running or a port is taken, and leaves a `pnpm dev` on other ports alone.
- `pnpm test` neither runs nor requires Playwright or a browser (Vitest includes only `src/**` and `eslint-rules/**`). CI does not run the browser tests. Lint, typecheck and `format:check` cover `e2e/`, `scripts/` and `playwright.config.ts`.
- `playwright.config.ts` at the root: `testDir: e2e`, one worker, `retries: 0`, a trace kept for every failed test. There is no `webServer` entry: the servers are started by `scripts/e2e.ts`, which must finish resetting the database before the API starts.
- The tests use a database named `lab_orders_e2e` (not `lab_orders_test`, so a run never empties what an integration run holds). The script creates it if it is missing, drops and recreates its tables, migrates and seeds it. The name is fixed in `src/server/db/guards.ts` (`e2eDatabaseUrl`) and the reset goes through `assertResettable`, so no setting can point it at another database; a unit test covers both.
- Each journey creates its own data with unique fake names and does not depend on the order the journeys run in.
- No `page.clock`, no fixed pause, and no assertion on a specific calendar date: the ready date is read from the dialog's preview and compared with the saved order.
- Elements are found by role, label and visible text, matched exactly where two names overlap ("Place new order" and "New order for this patient" are different buttons; the menu bar has no New order entry). No `data-testid` was needed.

**Journeys** (each a short readable test)

1. **Patients:** add a patient; a second one with the same email shows the duplicate warning naming the first (with its email); Create anyway saves it and both are listed.
2. **Place an order from the orders page:** pick the patient, quick-add a test by code and one by name, see the live total and ready date, submit, and see the same total and ready date on the list row and in the order panel (which also lists both tests).
3. **Advance an order:** ordered, collected, completed; a completed order offers no actions.
4. **Cancel an order:** an empty note is refused and the status stays; with a note and a name the panel shows "Cancelled by <name>" and the note, and offers no actions; the status filter finds the order.
5. **Filters:** filter the orders list by status and by patient; both filters survive a reload.
6. **New order from the patient page:** "New order for this patient" opens the dialog with the patient chosen, and after submit the order is in that patient's history.
7. **Menu bar:** it has only Orders, Patients and Catalog.
8. **Double click:** a double click on "Submit order" creates exactly one order.

**Logging**

- None added. The server logs warnings and errors to the terminal during the run (`LOG_LEVEL=warn`).

## Acceptance criteria

- [x] After `pnpm install` and the one-time browser download, `pnpm test:e2e` passes all journeys with no other manual step.
- [x] Running `pnpm test:e2e` three times in a row passes every time, in about 8 seconds of test time each.
- [x] `pnpm test` runs no browser and still passes; CI is unchanged.
- [x] A taken port stops the run with a clear message before anything is started.
- [x] The e2e database name cannot be changed by a setting (unit-tested in `guards.test.ts`).
- [x] No test uses `waitForTimeout` or `page.clock`.

## Tests

- **e2e:** the journeys above, in `e2e/`.
- **Unit:** `e2eDatabaseUrl` and the extended `assertResettable` list (`src/server/db/guards.test.ts`).
- The date rule is unit-tested in LAB-11. The e2e layer checks only that the screens agree.

## Docs to update

- `docs/testing.md`: the "Browser tests" section (what they cover, how to run them, the e2e database, how to see a failure's trace, why they are not in CI, what is deliberately not tested).
- `AGENTS.md`: the commands table.
- `README.md`: the one command and the one-time browser download (the full rewrite is LAB-22).

## Out of scope

- A CI job for the browser tests, CI retries and artifacts.
- The full acceptance-checklist run and the exploratory pass: LAB-23.
- More journeys (catalog editing, patient search): their rules are tested in LAB-06 to LAB-09.
- Cross-browser runs and visual regression.

## What to be able to explain

1. Why are there only a few browser tests, and what does each prove that the other layers cannot?
2. How does the script guarantee a clean database, and what stops it from wiping the wrong one?
3. Why does the order journey compare the preview with the list and the panel instead of asserting a calendar date?
4. Why does the script start the servers itself, on the settings' ports, with its own database?
5. Why does e2e run locally only and not on every pull request?
