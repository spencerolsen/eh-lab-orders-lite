# LAB-23: Submission readiness

- **Status:** Not started
- **Type:** Hardening
- **Depends on:** LAB-05 (Checks on every pull request), LAB-22 (Docs and README, final pass)
- **Unblocks:** nothing
- **Branch:** `lab-23-submission-readiness`

## Description

This is the last code task. It proves the project is ready to hand in: it works from a fresh clone, the whole acceptance checklist has been run in a real browser, and the code is tidy. After this task, "deployed" in the plan's sense is true: merged to `main`, all checks green, and the app runs from a fresh clone with `pnpm install` then `pnpm dev`.

It comes last because every check needs the finished app and docs. Most of its output is evidence (a results table, a bug list) and small fixes. Every bug found becomes an automated test in the layer that owns the rule, and is fixed on its own branch.

## Requirements

**Tooling: fresh-clone test**
- Clone the repo into a new empty folder with no `node_modules`, no `.env`, and no database volume from earlier work.
- Run, in order: `pnpm install`, `pnpm dev` (open the app in a browser), `pnpm test`, `pnpm test:e2e` (after the one-time Playwright browser download in the README). Each must succeed with no step that the README does not list. There is no manual copy of `.env.example`: with no `.env`, `pnpm dev` creates it and starts. `pnpm test` starts the test database container itself, so it also works as the first command on a fresh clone.
- Any step that needed something unwritten is fixed in the README or the setup script, on its own branch.
- The pull request checks (LAB-05) on `main` are green.

**Exploratory pass (Checkpoint 3)**
- This is Checkpoint 3 of `docs/acceptance-checklist.md`: everything, including idempotent create, patient order history and the New order entry points. Checkpoints 1 and 2 ran earlier (once LAB-04 and LAB-06 to LAB-12 had merged, and once LAB-13 to LAB-17 had merged); here they are run again against the final build.
- The AI runs every item of `docs/acceptance-checklist.md` in a real browser against the running app, one at a time, and records pass or fail with the date in the checklist's last-run column.
- Beyond the list it tries to break the app: empty input, 500-character input, special characters and emoji, double submits, back and forward, reload with a panel open, an unknown order id in the URL, the API stopped, two tabs changing one order.
- Each bug is logged (what, how to reproduce, expected), then given a failing automated test in the layer that owns the rule (unit, integration, or component; e2e only if it can be seen only in a browser), then fixed on its own branch off `main`. The test fails before the fix and passes after.

**Cleanup**
- Remove unused dependencies, dead code, unused exports, leftover `console.log`, TODOs and commented-out code. A tool such as `knip` is run once and not added to the project.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:e2e` pass. The lockfile is committed.
- A search finds no real personal data and no secrets in the repo, and no log line that writes names, dates of birth, contact details or search text.

**Logging**
- None added. The cleanup only checks that existing log lines carry ids and counts only.

## Acceptance criteria

- [ ] On a fresh clone, `pnpm install` then `pnpm dev` gives a running app that opens in a browser, with no step beyond what the README lists.
- [ ] On that fresh clone, `pnpm test` passes and `pnpm test:e2e` passes.
- [ ] The latest run of the pull request checks on `main` is green.
- [ ] Checkpoint 3: every item in `docs/acceptance-checklist.md` (all three checkpoint sections, including idempotent create, patient order history and the New order entry points) has a pass recorded for the final build, with the date.
- [ ] Every bug the exploratory pass found has a test that failed before the fix and passes now, each on its own branch; the bug list is in `docs/process.md`.
- [ ] `knip` run once reports zero unused dependencies and zero unused exports; a search of `src/` finds no `console.log`, TODO or commented-out code.
- [ ] A search of the repo finds no real personal data, no secrets, and no log call that includes a name, date of birth, contact detail or search text.
- [ ] `docs/plan/README.md` marks LAB-01 to LAB-23 as Done.
- [ ] The README and `docs/` still match the code after the fixes (the LAB-22 route and column comparisons are re-run and identical).
- [ ] The docs/process.md slice log entry and test log entry for this task were written in the same pull request.

## Tests

- No planned new tests. A test is added only when the exploratory pass finds a bug, in the layer that owns the rule.
- The three e2e journeys stay at three unless a bug can be reproduced only in a browser.
- The fresh-clone run is the final check of the existing suites.

## Docs to update

- `docs/acceptance-checklist.md`: final results and date.
- `docs/testing.md`: any tests the pass added, in the right layer.
- `README.md`: only the fixes the fresh-clone test demands, and the final hours figure.
- `docs/plan/README.md`: statuses set to Done.
- docs/process.md: slice log entry (what was asked for, what was rejected or changed and why) and test log entry, including the exploratory bug list.

## Out of scope

- New features and the future-version ideas in the README: future version.
- Deploying to a hosted environment: future version.
- Security audits, load tests and accessibility audits: future version.

## What to be able to explain

1. What does "ready to submit" mean for this project, and which evidence shows each part of it?
2. Why must a bug found by exploring get a failing test before it counts as fixed?
3. Why is the fresh-clone test run in a new folder and not the working one?
4. Pick any slice: how does a request travel through the code, and where does each rule on that path live?
5. What did the exploratory pass find that the automated tests missed, and where was each bug's test added?
