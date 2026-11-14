# LAB-12: Orders: place an order

- **Status:** Done
- **Type:** Vertical slice
- **Depends on:** LAB-09 (Patients: search by name and edit a patient), LAB-11 (Orders: see orders on the home page)
- **Unblocks:** LAB-13 (Orders: live total and ready date while building an order)
- **Branch:** lab-12-orders-place-an-order

## Description

After this task, a user on the Orders page presses "Place new order", finds a patient by name, types part of a test code or name, picks matches with the keyboard, presses "Submit order", and sees the new order at the top of the list.

This is the first write in the main workflow. It adds the order-creation transaction on the server and the New order modal on the screen, with the type-ahead quick-add box built from the start (there is no throwaway checklist). It comes after LAB-11 because it uses that task's tables and domain functions, and after LAB-09 because the patient picker reuses the patient name search. The live total and ready date are LAB-13; protection against a double submit is LAB-18.

## Requirements

**API**
- `POST /api/orders`, body `{ patientId, labTestIds: string[] }`, parsed explicitly with a Zod schema from `src/shared/`. Returns 201 with the same row shape as `GET /api/orders`.
- One database transaction: insert the order, then the items, copying code, name, price and turnaround from the catalog, and store `estimated_ready_date` from `estimateReadyDate` using one `now` read once in the service.
- The order-item response schema is defined once here, in `src/shared/`: `{ labTestId, testCode, testName, priceCents, turnaroundDays }`. LAB-13 (preview) and LAB-15 (detail panel) import and reuse it; nobody redefines it.
- 400 `VALIDATION_ERROR` for a malformed body: missing fields, ids that are not uuids, unknown extra fields.
- 422 `INVALID_ORDER_TESTS` for an empty list, a repeated id, an id that does not exist, or an inactive test; `details` names the offending ids.
- 422 `UNKNOWN_PATIENT` when the patient id does not exist.
- Every 422 saves nothing. Error shape `{ error: { code, message, details?, requestId } }`.
- The new files follow the folder rule: `routes.ts`, `service.ts` (it owns the transaction), `repo.ts`.

**Checkpoint 1 (AI exploratory browser pass)**
- Checkpoint 1 runs once every ticket filed under Checkpoint 1 (LAB-04's app-start checks and LAB-06 to LAB-12) has merged, not when this ticket alone merges. The AI exploratory browser pass then runs the Checkpoint 1 section of docs/acceptance-checklist.md against everything merged so far (app start and menu, catalog, patients, orders home page, placing an order). Each bug found gets a failing test in the right layer before it is fixed, on its own branch. The run and its findings are recorded in docs/process.md.

**Rules (pure, `src/shared/`, no React imports)**
- `matchTests(query, tests, selectedIds)` returns suggestions in this order: code equals the query; then code starts with the query; then name contains the query. Case-insensitive, query trimmed, empty query returns nothing. Inactive tests and tests in `selectedIds` are excluded. A test appears once, in its best group; inside a group, ordered by code.

**UI**
- A "Place new order" button on the Orders page (label and accessible name "Place new order") opens a native `dialog`. The patient-page button added in LAB-20 is named "New order for this patient"; the two names are deliberate, so tests and tickets can tell them apart. (A menu-bar "New order" was planned here; superseded by LAB-20: the owner removed it, so there are two entry points.)
- Step one: patient name search (the LAB-09 search and the shared `PatientLabel`, so each match shows name and date of birth). Picking one shows the chosen patient with a Change button. Reuse `usePatientSearch(q)` and `useDebouncedValue(text)` from `src/web/patients/usePatientSearch.ts` (the 300 ms wait and the query), not a copy.
- Step two: the quick-add box over the active tests already loaded from the catalog. Up to 8 suggestions. Arrow Up and Down move the highlight, Enter adds the highlighted test and clears the box, Escape closes the suggestion list, a click also adds. Enter with nothing highlighted does nothing and never submits. Quick-add is disabled with the hint "Choose a patient first" until a patient is selected.
- Chosen tests show code, name, price, turnaround and a Remove button. The modal's submit button has the label and accessible name "Submit order" and is disabled until a patient and at least one test are chosen.
- On success the modal closes and the list refreshes. A server error shows a plain message with the request id and keeps the modal open.
- No total or ready date in the modal yet.

**Logging**
- `debug` `order.ready_date_estimated` with the item count, the longest turnaround and the ready date (moved here from LAB-11, because this is the first server code that calls `estimateReadyDate`).
- `info` `order.created` with order id, patient id and item count. `warn` on each 422. No names, dates of birth or search text.

## Acceptance criteria

- [ ] Placing an order for one patient with CBC and LIPID creates 1 order and 2 items and shows it first in the list with test count 2.
- [ ] Items hold the code, name, price and turnaround the catalog had at that moment; after CBC's price_cents is changed by direct SQL in the test database, the existing order's total is unchanged (catalog editing, LAB-07, is not a dependency).
- [ ] Typing `li` offers LIPID; typing `cbc` offers CBC before any test whose name merely contains "cbc"; typing `CBC` and `cbc` give the same list.
- [ ] A test set inactive by direct SQL is never offered by quick-add and is rejected by POST /api/orders; a test already chosen is no longer offered.
- [ ] Quick-add is disabled with the hint "Choose a patient first" until a patient is selected.
- [ ] Arrow Down then Enter adds the highlighted test and empties the box; Enter in an empty box does not submit.
- [ ] An empty list, a repeated test, an unknown test and an inactive test each return 422 `INVALID_ORDER_TESTS` and leave `orders` and `order_items` row counts unchanged.
- [ ] An unknown patient id returns 422 `UNKNOWN_PATIENT` and saves nothing.
- [ ] A body with a non-uuid id, a missing field or an extra field returns 400 `VALIDATION_ERROR` with a request id.
- [ ] If an item insert fails inside the transaction, no order row remains.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 1).
- [ ] Checkpoint 1 was run: once LAB-04's app-start checks and LAB-06 to LAB-12 had all merged, the AI exploratory browser pass ran the Checkpoint 1 section of docs/acceptance-checklist.md against everything merged so far (app start and menu, catalog, patients, orders home page, placing an order); each bug found got a failing test in the right layer before it was fixed, on its own branch; the run and its findings are recorded in docs/process.md.
- [ ] The order-item response schema exists once in `src/shared/` with `labTestId`, `testCode`, `testName`, `priceCents`, `turnaroundDays`.
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.

## Tests

**Unit:** `matchTests` exact before prefix before contains; case-insensitive; excludes inactive; excludes selected; empty and whitespace query; no duplicates across groups; order inside a group.

**Integration** (real Postgres, HTTP): create happy path with snapshot fields; price change after ordering (done by direct SQL in the test); each 422 case with row counts; 400 shapes; rollback on a failing item. The ready-date rule is not retested; LAB-11 owns it.

**Component:** the "Place new order" button opens the modal; the modal keeps "Submit order" disabled until patient and test are chosen; keyboard add; Enter does not submit; error message shows the request id.

**E2E:** none here; the journey is LAB-21.

## Docs to update

- `docs/api.md`: `POST /api/orders`, with the 400 and 422 cases and codes.
- `docs/data-flow.md`: the place-an-order flow, including the transaction.
- `docs/architecture.md`: the orders service and why it exists (a transaction and a rule).
- `docs/acceptance-checklist.md`: the modal and quick-add checks (Checkpoint 1).
- `docs/process.md`: also the Checkpoint 1 run and its findings.
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry; note the limitation that an order cannot be edited after placing.

## Out of scope

- The live total and ready date in the modal, and the quote endpoint: LAB-13.
- Duplicate-order protection on a double click or retry: LAB-18.
- Opening the modal from the patient page: LAB-20. (A menu-bar button was planned; superseded by LAB-20, there is none.)
- Pasting a comma-separated list of tests, and AI matching: future version.
- Editing an order after it is placed: future version.

## What to be able to explain

1. Walk through, in order, what happens when POST /api/orders receives one inactive test. Which status code and error code, and what is saved?
2. Why does order creation live in a service while patients and catalog call their repository directly?
3. Why does the transaction read `now` once?
4. In what order does `matchTests` rank results, and why is it a pure function in `src/shared/`?
5. Why is an unknown patient a 422 and not a 404?
6. Why is the order-item shape defined once in `src/shared/`, and who reuses it?
7. Why do the two buttons that open the New order modal ("Place new order", "New order for this patient") have different names?
