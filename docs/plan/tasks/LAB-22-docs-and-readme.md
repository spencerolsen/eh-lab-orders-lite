# LAB-22: Docs and README, final pass

- **Status:** Done
- **Type:** Docs
- **Depends on:** LAB-07 (Catalog: edit and activate or deactivate tests), LAB-10 (Patients: duplicate warning on create), LAB-17 (Orders: cancel an order with a note and a name), LAB-20 (New order from the patient page), LAB-21 (Browser tests for the main journeys)
- **Unblocks:** LAB-23 (Submission readiness)
- **Branch:** `lab-22-docs-and-readme`

## Description

This task makes the written deliverable complete and consistent. It is a consistency pass: every earlier task wrote its own docs in its own pull request, and this task checks that they agree with the code as merged. It changes documents only.

The one new document is the README, written from scratch for a reviewer who has ten minutes. It says what the app is and does, how to run and test it, how it is built, the decisions and their trade-offs, the business rules, the known limits and what would come next, with links into `docs/`. After this task, a reviewer can set the app up with two commands and understand every decision from the docs alone.

## Requirements

**Check (docs against the code)**
- Every endpoint registered in the code appears in `docs/api.md`, and the reverse: path, body, status codes and error codes, checked by reading the routes and by calling the running API.
- Every table and column in the migrations appears in `docs/data-model.md`, and the reverse, including the cancellation columns and the idempotency key.
- The data model diagram and the data flow diagrams include the cancellation fields, the idempotency key, the quote flow, the status-change flow and the cancel flow.
- Statuses, error codes and field names in the docs match the code (`completed`; `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`, `DUPLICATE_TEST_CODE`, `POSSIBLE_DUPLICATE`, `CONTACT_REQUIRED`, `INVALID_ORDER_TESTS`, `UNKNOWN_PATIENT`, `ILLEGAL_TRANSITION`, `ORDER_CHANGED`).
- Every relative link in the README and `docs/` resolves, and every Mermaid diagram is valid.
- No company or employer name appears anywhere in the repository.

**README, in this order, each section short**
- What it is (three sentences) and what it does.
- Run it: Node 22 and Docker, then `corepack pnpm install` and `corepack pnpm dev`, with the address to open. Every command was run on a clean checkout.
- Test it: the four kinds of test, each with what it covers and its command, and why browser tests run locally only.
- How it is built: a small diagram (browser, API, database), the folder layout, and where the rules live (pure functions in `domain/`, SQL in `repo.ts`, one shared schema per input).
- Decisions and trade-offs: a table of the decisions that matter most, each with why and what it costs.
- Business rules in one place: statuses and allowed moves, the cancel rule, the ready-date rule with worked examples, the duplicate-patient rule.
- Reliability and observability: health check, graceful shutdown, startup config validation, request ids, logging standard, error shape.
- Known limits, and what I would do next, in priority order.
- How this was built, in the owner's voice (marked for the owner to reword).
- A table of links into `docs/`.

## Acceptance criteria

- [x] The routes in the code and the endpoints in `docs/api.md` are identical (compared by listing both).
- [x] The columns in the migrations and in `docs/data-model.md` are identical (compared by listing both).
- [x] The README has each section above, in that order.
- [x] `docs/testing.md` and the README describe four kinds of test and what each covers.
- [x] The README commands were run in the worktree; the setup is `corepack pnpm install` then `corepack pnpm dev`, and those two commands open a working app.
- [x] Every relative link in README.md and `docs/` resolves.
- [x] Every Mermaid block is valid.
- [x] The plan board and every finished ticket read Done; LAB-23 is unchanged.
- [x] `docs/plan/backlog.md` is a de-duplicated list of what was not done and why, grouped by theme.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` and `pnpm test` pass.

## Tests

- No new automated tests. This task changes documents only.
- The route-versus-docs and column-versus-docs comparisons and the link check are run by hand or by a script kept outside the repo.

## Docs to update

- `README.md`: written in this task.
- `docs/architecture.md`, `docs/api.md`, `docs/data-model.md`, `docs/data-flow.md`, `docs/testing.md` and `docs/acceptance-checklist.md`: corrected where they differed from the code.
- `docs/plan/`: the plan board and the backlog.

## Out of scope

- New features or behaviour changes: future version. If a doc can only be made true by changing code, the change is reported, not made here.
- Generated API docs (OpenAPI) and a docs website: future version.
- The fresh-clone test, the AI exploratory pass, the dependency cleanup and the final hours figure: LAB-23.

## What to be able to explain

1. Why is this a check and not a writing task, and what did it catch?
2. Why is the order total derived while the ready date is stored, and where do the docs say so?
3. Which decisions did you change from the AI's proposal, and why?
4. What are three deliberate cuts, and what would you ask the product owner before building each?
5. How do you know every endpoint and column in the code is in the docs?
