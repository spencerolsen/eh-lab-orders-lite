# LAB-22: Docs and README, final pass

- **Status:** Not started
- **Type:** Docs
- **Depends on:** LAB-07 (Catalog: edit and activate or deactivate tests), LAB-10 (Patients: duplicate warning on create), LAB-17 (Orders: cancel an order with a note and a name), LAB-20 (New order from the menu bar and the patient page), LAB-21 (Browser tests for the main journeys)
- **Unblocks:** LAB-23 (Submission readiness)
- **Branch:** `lab-22-docs-and-readme`

## Description

This task makes the written deliverable complete and consistent. It is a consistency pass: every earlier task already wrote its own docs and its own `docs/process.md` entry in its own pull request, and this task checks that they exist and agree with the code. It does not write them after the fact.

The one new document is the README. It gathers a short architecture overview, the decision log, assumptions, deliberate cuts, known limitations, AI usage, future versions and hours spent, drawn from `docs/process.md`, and links into `docs/`. After this task, a reviewer can set the app up with two commands and understand every decision from the docs alone.

## Requirements

**Check (per task)**
- For each of LAB-01 to LAB-21, confirm there is a slice log entry and a test log entry in `docs/process.md`, and that the docs the ticket lists exist. A missing entry is a failed check: the owning task's branch name is recorded in the pull request and the entry is written here, marked "added late" in the entry.
- Every endpoint registered in the code appears in `docs/api.md`, and the reverse. Every column in the migrations appears in `docs/data-model.md`, and the reverse.
- The only docs files that exist are: README.md, AGENTS.md, CLAUDE.md, docs/architecture.md, docs/api.md, docs/data-model.md, docs/data-flow.md, docs/testing.md, docs/acceptance-checklist.md, docs/process.md, docs/plan/. No link points to any other file.
- Statuses, error codes and field names in the docs match the code (`completed`; `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`, `DUPLICATE_TEST_CODE`, `POSSIBLE_DUPLICATE`, `CONTACT_REQUIRED`, `INVALID_ORDER_TESTS`, `UNKNOWN_PATIENT`, `ILLEGAL_TRANSITION`, `ORDER_CHANGED`).
- Every Mermaid diagram renders in the GitHub preview.

**README (short, links into `docs/`)**
- Setup: prerequisites (Node, pnpm, Docker), then `pnpm install`, then `pnpm dev` (which creates `.env` from `.env.example` when it is missing). One line each for `pnpm test` (unit, component and integration; it starts the database container itself, except in the automated checks, which provide their own) and `pnpm test:e2e` (browser tests, local only). Note that only `DATABASE_URL` (and `TEST_DATABASE_URL` for the tests, whose database name must end in `_test`) is needed, so another Postgres works. Mention that the default clinic timezone is `America/Denver` (`CLINIC_TIMEZONE`), used for ready dates, the date-of-birth check and the created time shown on orders.
- Scope: a short list of what the app does.
- Testing: four kinds of test, each with what it proves: unit (pure rules), component (one screen piece in isolation), integration (the API against a real Postgres), end to end (the real app in a browser). No test counts are stated in the README.
- Architecture in brief: five to eight lines plus one diagram, linking to `docs/architecture.md`.
- Decision log: a table of choice, alternative considered, why. Taken from `docs/process.md`.
- Assumptions: turnaround clock starts at order time, tests run in parallel, one clinic and timezone, one currency, one status per order, a test once per order, weekend orders count as Monday morning. Plus any assumption a slice recorded in its process entry.
- Deliberate cuts: login and roles, editing orders, holidays and cut-off times, per-test status, voiding completed orders, paste-a-list quick-add, AI in the running app, patient name on the order, an e2e job in CI.
- Known limitations: gathered from every ticket's process entry, each with what would be done next. It includes last-save-wins edits (catalog and patients), the duplicate-patient race, offset paging drift, the idempotency limits (keys never expire, keys are not scoped per user, a replay with a different body is not detected, and the changed-patient-after-a-failed-submit case, whose fix is a new key whenever the content changes plus a server-side fingerprint check returning 422) and no public holidays.
- AI usage: how AI was used and what the candidate rejected or changed, in the candidate's words, from `docs/process.md`.
- Future versions: the questions on roles, mission-critical paths and alerting, scale, security, AI-forward ideas and editing orders.
- Hours spent: the real figure, written by the candidate.
- Links to each file in `docs/` and to `docs/plan/`.

**Tooling**
- Run every command in the README in a clean shell. Anything that fails is fixed in the text, or in the code on its own branch with a test.
- No change to application behaviour in this task.

## Acceptance criteria

- [ ] `docs/process.md` has a slice log entry and a test log entry for each of LAB-01 to LAB-21, none empty; any added late are marked.
- [ ] The list of routes in the code and the endpoints in `docs/api.md` are identical (compared by listing both).
- [ ] The columns in the migrations and in `docs/data-model.md` are identical (compared by listing both).
- [ ] A search of README.md and `docs/` finds no reference to a docs file outside the list above, and no `resulted`, `VALIDATION_FAILED`, `pnpm setup` or lower-case error code. The search excludes `docs/process.md` and `docs/plan/`, which record those words on purpose.
- [ ] The README contains each section: setup, scope, testing, architecture in brief, decision log, assumptions, deliberate cuts, known limitations, AI usage, future versions, hours spent.
- [ ] `docs/testing.md` and the README describe four kinds of test (unit, component, integration, end to end) and what each proves; no "three layers" wording and no fixed test count remains that the tickets contradict.
- [ ] The README setup names the default clinic timezone.
- [ ] The README setup is `pnpm install` then `pnpm dev`, and on a shell with Node, pnpm and Docker those two commands open a working app.
- [ ] Every link in README.md and `docs/` resolves (checked by hand or with a link checker run once).
- [ ] Every Mermaid diagram renders in the GitHub preview.
- [ ] The hours-spent figure and the AI-usage section are filled in by the candidate; no placeholder text remains.
- [ ] The docs/process.md slice log entry and test log entry for this task were written in the same pull request.

## Tests

- No new automated tests. This task changes documents only.
- The route-versus-docs and column-versus-docs comparisons and the link check are run by hand or by a script kept outside the repo.

## Docs to update

- `README.md`: written in this task, as above.
- `docs/plan/`: set every task's status in the index, `docs/plan/README.md`.
- `docs/testing.md`: check it describes the four kinds of test, matching the README.
- `AGENTS.md` and `CLAUDE.md`: check the commands and the folder map are still true.
- Any file in `docs/` where the check finds a mismatch with the code: fix the text, not the code.
- docs/process.md: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.

## Out of scope

- New features or behaviour changes: future version.
- Generated API docs (OpenAPI) and a docs website: future version.
- The fresh-clone test, the AI exploratory pass and the dependency cleanup: LAB-23.

## What to be able to explain

1. Why is this a check and not a writing task, and what did it catch?
2. Why is the order total derived while the ready date is stored, and where do the docs say so?
3. Which decisions did you change from the AI's proposal, and why?
4. What are three deliberate cuts, and what would you ask the product owner before building each?
5. How do you know every endpoint and column in the code is in the docs?
