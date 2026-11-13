# LAB-01: Repo skeleton and tooling

- **Status:** Done
- **Type:** Groundwork
- **Depends on:** nothing
- **Unblocks:** LAB-02 (Database, migrations and config)
- **Branch:** `lab-01-repo-skeleton-and-tooling`

## Description

This task creates the empty but working shell of the project: one package with the three source folders, the language and lint settings, a test runner that runs one trivial test, and the files that tell people and AI assistants how the repo is organised. The build plan is already in the repo under `docs/plan/`; this task creates stub pages for the documents that later tasks fill in. No app behaviour exists yet.

It comes first because every later task assumes these rules are already enforced by tooling: strict types, the import boundary between server and web, and a single command to run the tests. The first commit and push (the plan only) were approved before this task started; this task is the first feature branch and pull request, like every later task.

## Requirements

**Tooling**
- One package (no workspace). `package.json` uses pnpm, pinned with the `packageManager` field. Node version pinned in `.nvmrc` and the `engines` field.
- TypeScript in strict mode, one `tsconfig.json`, with module settings that work for both Node (server) and Vite (web) later.
- ESLint (flat config) with the TypeScript rules and one import-boundary rule: files in `src/server` may not import from `src/web`; files in `src/web` may not import from `src/server`; both may import from `src/shared`; `src/shared` imports from neither.
- Vitest configured with one trivial passing test (`src/shared/smoke.test.ts`). Scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`, `pnpm format:check`. `pnpm test` runs unit and integration tests. `pnpm test:e2e` (browser tests, local only) is added in LAB-21.
- Prettier, with one small config (`.prettierrc.json`) and a `.prettierignore`. Markdown is kept out of Prettier's reach so the plan documents are never reformatted. (Changed after the ticket was written: it first said no formatter is added.)

**Folders**
- `src/server/`, `src/web/`, `src/shared/`, each with a short placeholder file so the folder exists in git. No feature folders (`orders`, `patients`, `catalog`) yet; later tasks add them as `src/server/<feature>/` and `src/web/<feature>/`.

**Files at the root**
- `.env.example` listing the settings the app will need later (`DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`, `LOG_LEVEL`, `CLINIC_TIMEZONE`) with safe sample values and one comment line each. LAB-02 makes them real.
- `.gitignore` covering `node_modules`, build output, `.env`, coverage, Playwright reports and editor files. `.env` is ignored; `.env.example` is not.
- `AGENTS.md`: how the codebase is organised (folders, where rules, queries and tests go), the commands, the import boundary, the conventions (money in cents, dates as `YYYY-MM-DD` strings, logs carry ids and counts only, each fixed list of values such as order statuses is defined once in `src/shared/` and everything else derives from it), and the one-branch-per-task workflow. `CLAUDE.md` is one line that imports it (`@AGENTS.md`).
- `README.md` stub: what the app is, prerequisites (Node, pnpm, Docker), and a list of links to the docs. LAB-22 writes the full README.

**Docs**
- The plan is already in `docs/plan/` (the index page is `docs/plan/README.md`, never `index.md`, plus `REVIEW.md` and the `tasks/` folder). It is not moved or rewritten.
- The process log stays outside the repo for now (changed after the ticket was written). No `docs/process.md` is created and the README does not link to it. A note in `docs/plan/README.md`, under "Definition of done", says so: entries a ticket says are written in its pull request are written to the outside log at the same time, and the log is added to the repo when the candidate chooses.
- Create exactly six stubs, each with a title, a one-sentence purpose and "To be filled in by LAB-NN": `docs/architecture.md`, `docs/api.md`, `docs/data-model.md`, `docs/data-flow.md`, `docs/testing.md`, `docs/acceptance-checklist.md`. The `docs/acceptance-checklist.md` stub has three headed sections, Checkpoint 1, Checkpoint 2 and Checkpoint 3, each stating when it runs (Checkpoint 1: once LAB-04's app-start checks and LAB-06 to LAB-12 have all merged; Checkpoint 2: once LAB-13 to LAB-17 have all merged; Checkpoint 3: in LAB-23) and what it covers (Checkpoint 1: app start and menu, catalog, patients, orders home page, placing an order; Checkpoint 2: live preview, filters, detail panel, status changes, cancel; Checkpoint 3: everything, including idempotent create, patient order history and the New order entry points). No other file exists under `docs/` apart from `plan/`.

## Acceptance criteria

- [ ] On a fresh clone, `pnpm install` then `pnpm test` passes, running the smoke test and the import-boundary rule tests and nothing else.
- [ ] `pnpm typecheck` passes, and a deliberate implicit `any` makes it fail.
- [ ] `pnpm lint` and `pnpm format:check` pass on the repo as committed.
- [ ] A temporary import from `src/server` into `src/web` makes `pnpm lint` fail with a message naming the boundary; the same for `src/web` into `src/server`; `src/shared` importing either side fails too; an import of `src/shared` from either side passes.
- [ ] `.env` is ignored by git and `.env.example` is tracked.
- [ ] `CLAUDE.md` is a single line that imports `AGENTS.md`, and `AGENTS.md` names every command and folder rule listed above.
- [ ] `docs/plan/` contains `README.md` (the index), `REVIEW.md` and all 23 task files, unchanged apart from this ticket, status rows and the process-log note; `docs/process.md` does not exist.
- [ ] Exactly six stub documents exist under `docs/` (architecture, api, data-model, data-flow, testing, acceptance-checklist) and each names the task that fills it in; the acceptance-checklist stub has the three Checkpoint sections.
- [ ] No file in the repo contains app behaviour (no server, no pages, no SQL).
- [ ] The first commit and push (the plan only) happened only after the candidate approved them.
- [ ] The process log slice entry and test entry for this task are written to the log outside the repo at the same time as this pull request.

## Tests

- **Unit:** one trivial test (`smoke: the test runner runs`) that proves Vitest is wired up. LAB-03 and later tasks add real tests next to it.
- **Rule tests:** `eslint-rules/import-boundary.test.js` runs the boundary rule through ESLint's `RuleTester`. It must report server to web, web to server, shared to either, `import type`, `export { … } from`, `export * from`, a dynamic `import()`, a backtick path with no `${}`, and a type written as `typeof import(…)`. It must stay silent for server or web importing shared, and for a top-level folder `src/server-utils/` imported from web (a name that only starts with `server` is not `src/server`). One more case shows that a package name such as `react-dom/server` is ignored; it documents the behaviour but cannot catch a regression, because package names are never resolved. (Added after review: the ticket first said the rule was checked by hand only.) LAB-05 makes `pnpm lint` and `pnpm test` run on every pull request.

## Docs to update

- `README.md` (stub), `AGENTS.md` and `CLAUDE.md` (created).
- `docs/plan/README.md`: the note that the process log is kept outside the repo for now.
- Stubs created for `docs/architecture.md`, `docs/api.md`, `docs/data-model.md`, `docs/data-flow.md`, `docs/testing.md`, `docs/acceptance-checklist.md`.
- The process log (outside the repo for now): slice log entry (what was asked for, what was rejected or changed and why) and test log entry.
- Status table in `docs/plan/README.md` (LAB-01 set to Done when merged).

## Out of scope

- Database, Docker Compose, migrations and config validation: LAB-02.
- Server, logging and error handling: LAB-03. The web shell and `pnpm dev`: LAB-04.
- The pull-request workflow in GitHub Actions: LAB-05. Until then the checks run by hand.
- Playwright setup: LAB-21. The full README: LAB-22.

## What to be able to explain

1. Why is this one package with three folders and a lint rule, and not a workspace with separate packages? What does the lint rule protect?
2. What does `src/shared` hold, and why may both server and web import it but not each other?
3. What is `AGENTS.md` for, and why is `CLAUDE.md` only one line?
4. Why does the plan live inside the repo, why does the process log stay outside it for now, and why was nothing pushed before you approved the first commit?
5. What does "no app behaviour yet" buy us as a first merge to `main`?
