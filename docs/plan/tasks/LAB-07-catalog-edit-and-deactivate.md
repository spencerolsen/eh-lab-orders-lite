# LAB-07: Catalog: edit and activate or deactivate tests

- **Status:** Done
- **Type:** Vertical slice
- **Depends on:** LAB-06 (Catalog: see and add lab tests)
- **Unblocks:** LAB-22 (Docs and README, final pass)
- **Branch:** `lab-07-catalog-edit-and-deactivate`

## Description

After this task, a user can correct a lab test's name, price or turnaround from the Lab tests page, and switch a test between active and inactive. The test's code is locked: it never changes after creation.

It follows LAB-06 because it reuses that page, schema and repository. Tests are never deleted: old orders point at them, and a deactivated test simply stops being offered on new orders. Price and turnaround edited here only affect orders placed afterwards, because order items copy these values at order time (LAB-12).

## Requirements

**Data**
- No new columns and no migration. `updated_at` is set on every change.
- `lab_tests` has no trigger for `updated_at` (LAB-06): the update's SQL sets `updated_at = now()` itself.

**API**
- `PATCH /api/lab-tests/:id` with any subset of `{ name, priceCents, turnaroundDays, isActive }` returns 200 with the full updated test (same shape as LAB-06). Same field rules as create. An empty body `{}` returns 400 `VALIDATION_ERROR`.
- **Code immutability is enforced in the API only.** The update schema does not accept `code` and is strict, so a request containing `code` (or any unknown key) returns 400 `VALIDATION_ERROR` with a detail on that key. It is a deliberate refusal, not a silent ignore. **Uniqueness is enforced by the database** (the unique constraint from LAB-06). A database trigger to block code changes was judged more machinery than this rule needs, because the only writer is this API.
- 404 `NOT_FOUND` if no test has that id; 400 `VALIDATION_ERROR` if the id in the path is not a uuid.
- There is no `DELETE` endpoint; a request to one gets the standard 404.
- The update is one SQL `UPDATE ... RETURNING`, so it is atomic. The schema is in `src/shared/`; the route parses explicitly and calls the repo directly.

**UI**
- Each row gets an Edit button. Edit opens the add form in edit mode, filled with the row's values. The code field is shown but disabled, with the note "Code cannot be changed". Price is shown in dollars and converted back with the LAB-06 helpers.
- Save returns to the list with the row updated; Cancel discards the changes.
- Each row has an Activate or Deactivate button that applies at once. Inactive rows are dimmed and labelled "Inactive". The button is disabled while its request is running.
- Field errors work as in LAB-06. A 404 (test vanished) shows a plain message and refreshes the list.

**Rules**
- A test can be deactivated at any time; existing orders are unaffected.
- Editing price or turnaround never touches existing order items.

**Logging**
- `info` `lab_test.updated`, once per update, with `labTestId` and `fieldCount` (never values or field names: nothing from a request reaches the logs except ids and counts). When the active flag changed, the same line has `active: "activated"` or `"deactivated"`, so switching a test on or off can be traced. `warn` for a rejected update (the standard `request.rejected` line).

  *Changed during the build (owner's brief): one event with an `active` field instead of separate `lab_test.activated` and `lab_test.deactivated` events, and a count instead of the field names.*

## Acceptance criteria

- [ ] Editing the name of `CBC` and saving shows the new name in the table and keeps the code `CBC`.
- [ ] Editing a price to `25.00` stores `price_cents = 2500`; the table shows `$25.00`.
- [ ] In the edit form the code field cannot be typed into.
- [ ] `PATCH` with `{ "code": "NEW-1" }` returns 400 `VALIDATION_ERROR` and the stored code is unchanged.
- [ ] `PATCH` with `{}` returns 400; with `turnaroundDays: 0` returns 400 with a detail on `turnaroundDays`.
- [ ] `PATCH` on a well-formed unknown id returns 404 `NOT_FOUND` with the error shape and a request id; a malformed id returns 400.
- [ ] Deactivating `TSH` shows it as inactive without a reload; activating it again restores it.
- [ ] `PATCH` changes only the fields sent; the others keep their values and `updated_at` moves forward.
- [ ] `DELETE /api/lab-tests/:id` returns 404 and removes nothing; the UI has no delete control.
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 1).

## Tests

- **Unit:** the update schema (rejects `code` and unknown keys, rejects `{}`, accepts each single field, boundary values).
- **Integration:** patch each field alone and together; rejects `code`; 400 on empty body and bad values; 404 on an unknown id; 400 on a malformed id; toggling `isActive` both ways; untouched fields unchanged; `updated_at` advances; `DELETE` is not routed.
- **Component:** the edit form disables the code field and sends only the changed fields.
- **E2E:** none here; the main journeys are LAB-21.

## Docs to update

- `docs/api.md`: `PATCH /api/lab-tests/:id`, the rejection of `code`, no delete.
- `docs/data-model.md`: `code` is immutable (API-enforced) and unique (database-enforced); tests are deactivated, never deleted.
- `docs/acceptance-checklist.md`: add the edit and toggle checks to the catalog section (Checkpoint 1).
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry; record the trigger decision and the last-save-wins limitation here.
- `docs/plan/`: set this task's status.

## Decisions made during the build

- **A PATCH with no fields is a 400** (`{}` gets one detail on `(input)`). A body that only holds a refused key (`{ "code": "X" }`) gets the detail on that key alone, not also "empty".
- **The edit form sends only the fields that changed.** Saving an edit that changed nothing sends no request and just closes the form (an empty PATCH would be a 400).
- **One form for add and edit** (`LabTestForm`), below the table; Edit fills it, the heading reads "Edit CBC", Cancel returns it to adding. Simpler to follow and to test than inline row editing.
- **Activate and Deactivate are buttons, not a checkbox**, as the requirements say; so the global `input` rule's checkbox styling (backlog) is untouched.
- **The update returns the old active flag** (a `with old as (select ... for update)` step in the same statement), so the log says activated or deactivated only when the flag actually changed.
- **The table's last column is "Status"** with "Active" or "Inactive" in words (it was "Active" with Yes or No); an inactive row also has the `muted` class.
- **Two small additions to the theme**: `input:disabled` (muted text on the page colour, 6.15:1) for the locked code, and `.row-actions` for two buttons in a cell. Both are on `/styles`.
- **No migration**: the table from LAB-06 has every column this needs.
- The `docs/process.md` items in this ticket are kept outside the repository instead.

## Out of scope

- A database trigger that blocks code changes: deliberately not built (API-only rule, see Requirements).
- Hiding inactive tests from the order form and rejecting them on a new order: LAB-12.
- Showing which orders use a test, or warning before deactivating: future version.
- Price history or an audit trail of edits: future version.
- Two people editing the same test at once: **last save wins**, the accepted behaviour for this version. Recorded in `docs/plan/backlog.md` (the fix would be optimistic locking on `updated_at`); gathered in the README by LAB-22.
- Deleting a test: never.

## What to be able to explain

1. Why can a test be deactivated but never deleted, and what in the data model makes that matter?
2. Why does the API refuse `code` in an update, why is that not also a database trigger, and what does the database enforce instead?
3. If a test's price is edited today, what happens to an order placed yesterday, and why?
4. Why is the update a single `UPDATE ... RETURNING` instead of read, then write?
5. How does one form component serve both add and edit?
