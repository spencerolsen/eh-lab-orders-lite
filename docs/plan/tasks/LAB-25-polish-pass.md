# LAB-25: Polish pass

- **Status:** In progress
- **Type:** Hardening
- **Depends on:** LAB-20 (New order from the patient page)
- **Unblocks:** nothing
- **Branch:** `lab-25-polish-pass`

## Description

Two hands-on browser checkpoints, run after the feature tickets were merged, found rough edges. This task fixes the ones the owner chose: small, mostly visual changes. It adds no feature, changes no business rule and needs no migration. The items the owner did not choose go to the [backlog](../backlog.md).

## Requirements

1. **Order panel, patient.** The panel shows the patient's name only, with no date of birth. The orders table and the patient pages keep the date of birth. `AGENTS.md` says where `PatientLabel` is used so the sentence stays true.
2. **Select arrow.** Every `<select>` draws its own arrow in the shared style in `base.css`, inset to line up with the field's text padding on the left. The colour comes from a custom property.
3. **Long unbroken text wraps.** The cancel note and the canceller's name in the order panel, and a long unbroken patient name in the Patients table and anywhere else a name is shown, wrap instead of overflowing. One shared rule in `base.css`.
4. **Order panel errors.** Only the latest error is shown. An earlier one is cleared when the panel reloads the order, when the cancel form is opened and when an action succeeds. When the server refuses a move with 422 or 409 because the order has changed, the panel shows "This order has changed. It is now <status label>." after the reload, in place of the raw sentence. The reload itself does not change.
5. **Orders table at 1024 wide.** Dates do not wrap inside a cell (a shared class with `white-space: nowrap`).
6. **New order dialog layout.** The dialog is anchored near the top, so it does not jump as tests are added. When the list of tests is long, the list scrolls and the total, the ready date and the buttons stay visible.
7. **Unknown patient in the orders filter.** A well-formed `?patientId=` that matches no patient shows "There is no patient with this id" without a "Try again" button.
8. **Order panel heading.** "Order for <patient name>" instead of "Order"; it is the dialog's accessible name.
9. **Date of birth lower limit.** A date of birth before 1900-01-01 is refused, in the shared patient schema, so the form and the server agree. No database change.
10. **New order dialog, stale error.** An error from a failed submit is cleared when the patient or the tests change. When the server refuses because a test cannot be ordered, the message names the test (code and name) if the response already allows it.
11. **Sample data.** The orders seed adds one cancelled order, so the cancelled state is visible on a fresh install.
12. **Known limit, documented only.** If a test's price or turnaround changes while the New order dialog is open, the order is saved with the server's current price and ready date, which can differ from the preview. Written in `docs/api.md` next to the idempotency limit, with the fuller fix on the backlog.
13. **Backlog only.** The checkpoint items that were not chosen are one line each in `docs/plan/backlog.md`.

## Acceptance criteria

- [ ] Each of items 1 to 11 behaves as written above, and each has a test that fails without the fix where a test can check it (for pure layout, a test of the class or attribute that carries the fix, plus a look in a real browser at 1280 and 1024 wide).
- [ ] No colour literal is added outside the custom properties; no media query is added.
- [ ] `/styles` shows the shared select and the wrapping rule.
- [ ] No business rule, API shape or migration changes.
- [ ] `docs/api.md` and `docs/data-model.md` state the date of birth limit where they state the date rules; `docs/api.md` states the known limit of item 12.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` and `pnpm test` pass.

## Tests

Component tests for the panel (heading, no date of birth, error clearing, the changed-order sentence), the orders page (no retry for an unknown patient), the New order dialog (stale error, named test), the shared styles (select, wrapping and date classes) and the patient schema (the lower limit); the seed count test for the cancelled order.

## Docs to update

- `AGENTS.md` (the `PatientLabel` sentence), `docs/api.md`, `docs/data-model.md`, `docs/plan/backlog.md`, `docs/plan/README.md`.

## Out of scope

- Any new feature, business rule or migration.
- The backlog items (see item 13).

## Notes from the build

(Filled in when the task is built.)
