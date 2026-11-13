# LAB-05: Checks on every pull request

- **Status:** Not started
- **Type:** Groundwork
- **Depends on:** LAB-04 (Web foundation: app shell and navigation)
- **Unblocks:** LAB-06 (Catalog: see and add lab tests), LAB-08 (Patients: add and list patients), LAB-23 (Submission readiness)
- **Branch:** `lab-05-continuous-integration`

## Description

This task adds a GitHub Actions workflow that runs the project's checks automatically on every pull request and on every push to `main`: install, lint, type check, and the unit and integration tests against a real Postgres. It also writes down the branch-per-task workflow in `AGENTS.md` and the README so anyone, human or AI, follows it.

It merges before any feature slice: LAB-06 and LAB-08 depend on it, so every slice is checked before the candidate reviews it. This is what makes "main always works" a checked fact and not only a promise. GitHub Actions is free for public repositories and includes a monthly allowance of free minutes for private ones, which this small project will not exceed.

## Requirements

**Tooling**
- One workflow file, `.github/workflows/ci.yml`, named "CI". Triggers: `pull_request` (any target) and `push` to `main`. A `concurrency` group cancels an older run on the same branch when a newer one starts.
- One job, `checks`, on `ubuntu-latest`, with a 10-minute timeout and read-only repository permissions (`contents: read`).
- Postgres 16 as a service container with a healthcheck, exposed on the runner's port 5432. The job environment sets `TEST_DATABASE_URL` for the test database on that port (its name ends in `_test`, which the harness requires; 5433 belongs to the local Docker Compose setup only), `DATABASE_URL` pointing at the service container on port 5432, `LOG_LEVEL=error` and `CLINIC_TIMEZONE=America/Denver`. The test database is created in a step before the tests run, and is named exactly `lab_orders_test`: `pnpm db:test:reset` only resets `lab_orders` or `lab_orders_test` (LAB-02). CI does not use Docker Compose: the `pnpm test` script skips the "start the database container" step when the `CI` environment variable is set (GitHub Actions sets it), so it uses the Postgres service container.
- Steps in order, each named: checkout; set up pnpm (version from `packageManager`); set up Node (version from `.nvmrc`) with the pnpm cache; `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm typecheck`; `pnpm test` (`pnpm test` runs unit, component and integration tests). A failure points to the right step.
- Third-party actions are pinned to a major version at least; no secrets are used or needed.
- Browser (Playwright) tests are not run in CI. This is a deliberate cut: they are the slowest and most fragile layer, so they run locally with `pnpm test:e2e`. The cut is recorded here and in LAB-21, and in `docs/testing.md`.
- Protecting `main` so a pull request needs the `checks` job to pass is a GitHub settings change made by the candidate, and is recorded in the docs. The workflow works whether or not it is switched on.

**Rules**
- The branch-per-task workflow, written in `AGENTS.md` and the README: one feature branch off `main` per task, named like `lab-06-catalog-list-and-add`; tests and docs are written with the task; run `pnpm lint`, `pnpm typecheck` and `pnpm test` locally before opening the pull request; open a pull request into `main`; the candidate reviews and merges; `main` always works. "Deployed" means merged to `main`, all checks green, and the app runs from a fresh clone with `pnpm install` then `pnpm dev`.
- A pull request template (`.github/pull_request_template.md`) with: what changed, the task id, the acceptance checklist copied from the task file, how it was checked, and what the candidate should be able to explain.

**Docs**
- A CI status badge in the README, added once the workflow has run on `main`.

## Acceptance criteria

- [ ] Opening a pull request starts the "CI" workflow without any manual step, and the run appears on the pull request.
- [ ] A pull request with all checks passing shows a green result, and the run duration shown by GitHub is under 5 minutes.
- [ ] A pull request containing a lint error fails at the step named for lint.
- [ ] A pull request containing a type error fails at the step named for type check.
- [ ] A pull request containing a deliberately failing integration test fails at the test step, and a passing run executes at least 1 test that reads and writes the database, which shows the Postgres service is reached.
- [ ] In CI, `pnpm test` does not try to start Docker Compose and uses the Postgres service container.
- [ ] A push to `main` runs the same checks.
- [ ] Pushing a second commit to an open pull request cancels the older run.
- [ ] The workflow file uses 0 secrets and requests only `contents: read`.
- [ ] The workflow file contains no Playwright or `test:e2e` step.
- [ ] `AGENTS.md` and `README.md` both describe the branch-per-task workflow and the definition of "deployed", and the pull request template appears when a new pull request is opened.
- [ ] The `docs/process.md` slice log entry and test log entry for this task were written in the same pull request.

## Tests

- There is no new test code. This task is verified by running the workflow: the happy path, plus three throwaway pull requests (or commits on a scratch branch) that deliberately fail lint, types and a test, each deleted afterwards.
- The existing unit, integration and component tests from LAB-03 and LAB-04 are what the workflow runs.

## Docs to update

- `AGENTS.md` (workflow, checks, what CI runs), `README.md` (workflow section, badge).
- `docs/testing.md` (which kinds of test run in CI and which do not; browser tests are not in CI by decision; where the test database lives in CI and that the workflow sets `TEST_DATABASE_URL` and `DATABASE_URL`, and that `pnpm test` skips the container start when `CI` is set).
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.
- Status table in `docs/plan/README.md` (LAB-05 set to Done when merged).

## Out of scope

- Browser (Playwright) tests in CI: not built; a deliberate cut, see LAB-21 for the local browser tests.
- Deployment to a hosting service, preview environments, release tagging: future version; there is no real production in this project.
- Code coverage thresholds, dependency scanning, Docker image caching: future version.
- Switching on branch protection: a GitHub settings change made by the candidate, not code.
- Final check that CI is green on `main`: LAB-23.

## What to be able to explain

1. What does the workflow run, in what order, and why is the order useful when something fails?
2. Why is the Postgres in CI on port 5432 while local development uses 5433?
3. What does "main always works" depend on, and what still slips through because browser tests are not in CI?
4. Why is the workflow limited to read-only permissions and no secrets?
5. What does "deployed" mean for this project, and why was that definition chosen?
