# LAB-17: Orders: cancel an order with a note and a name

- **Status:** Not started
- **Type:** Vertical slice
- **Depends on:** LAB-14 (Orders: filter the list by status and patient), LAB-16 (Orders: mark an order collected or completed)
- **Unblocks:** LAB-21 (Browser tests for the main journeys), LAB-22 (Docs and README, final pass)
- **Branch:** `lab-17-orders-cancel`

## Description

After this task, a user can cancel an order that is still `ordered` or `collected` by typing why and who is cancelling. The cancelled order is kept, and its panel shows who cancelled it, when, and why. Orders that are `completed` or already `cancelled` cannot be cancelled and show no cancel form. A cancelled order shows up when the list is filtered by the cancelled status.

This follows LAB-16 because it reuses the transition table (LAB-15) and the same read, check, conditional-update flow, and adds only what is new: three columns, one endpoint and one form. It also needs the status filter from LAB-14 so the cancelled order can be found. There is no login in this version, so the name is typed in; with authentication it would come from the signed-in user. Cancelling is its own endpoint, and not a value of `to` on the transitions endpoint, because it carries required data the other moves do not.

## Requirements

**Data**
- A migration adding to `orders`: `cancellation_note text`, `cancelled_by text`, `cancelled_at timestamptz`, all nullable.
- A CHECK constraint: `status = 'cancelled'` requires all three non-null and non-blank; any other status requires all three null. Existing rows are unaffected because none are cancelled: the LAB-11 seed has no cancelled order for exactly this reason. This task may add one seeded cancelled order (fixed id, with all three fields) so the status filter has one to show.

**API**
- `POST /api/orders/:id/cancel` with body `{ "note": string, "cancelledBy": string }`. Both required and trimmed: note 1 to 500 characters, name 1 to 100. Missing, blank, too long, wrong type or unknown extra fields: 400 `VALIDATION_ERROR` with field details.
- Same flow as LAB-16:
  1. Read the order. Missing: 404 `NOT_FOUND`.
  2. `assertTransition(current, "cancelled")`. From `completed` or `cancelled`: 422 `ILLEGAL_TRANSITION`.
  3. `UPDATE orders SET status = 'cancelled', cancellation_note = $1, cancelled_by = $2, cancelled_at = now(), updated_at = now() WHERE id = $3 AND status = $previous`. Zero rows: 409 `ORDER_CHANGED`.
- Success: 200 with the updated order.
- `GET /api/orders/:id` and the transitions response now also include `cancellation` (`note`, `cancelledBy`, `cancelledAt`) when cancelled, and `null` otherwise.

**Rules**
- The transition table from LAB-15 is the only place that says which statuses can be cancelled. No second list is written for cancel. In code, `cancelled` is referred to through `ORDER_STATUSES` (LAB-11); the CHECK constraint above is the one other place the status appears.
- A cancelled order is never deleted and its items stay as they were.

**Checkpoint 2 (AI exploratory browser pass)**
- Checkpoint 2 runs once LAB-13 to LAB-17 have all merged, not when this ticket alone merges. The AI exploratory browser pass then runs the Checkpoint 2 section of docs/acceptance-checklist.md against everything merged so far (live preview, filters, detail panel, status changes, cancel). Each bug found gets a failing test in the right layer before it is fixed, on its own branch. The run and its findings are recorded in docs/process.md.

**UI**
- In the panel, when `canCancel` is true, a "Cancel order" action reveals a form inside the panel (not a second dialog) with a required note field, a required "Your name" field, and "Confirm cancel" and "Keep order" buttons.
- Both fields are checked before sending, with a plain message under each. The server still validates.
- When `canCancel` is false the form and the action are not rendered.
- A cancelled order shows "Cancelled by NAME on DATE: NOTE" and no status buttons.
- On 409 or 422 the panel explains it and reloads the real state. On success the orders list behind the panel refreshes.

**Logging**
- `info` `order.cancelled` with `orderId` and `from` status only. The note and the name are not logged.
- `warn` `order.cancel_refused` and `order.cancel_lost_race`, with the id and statuses.

## Acceptance criteria

- [ ] An `ordered` order and a `collected` order each show "Cancel order"; a `completed` order and a `cancelled` order do not.
- [ ] Submitting the form with an empty note or empty name is blocked in the browser with a message under the empty field.
- [ ] `POST .../cancel` with the note or `cancelledBy` missing, blank, or over its limit (501 characters, 101 characters) returns 400 `VALIDATION_ERROR` and the order is unchanged.
- [ ] Cancelling a `collected` order succeeds, and the panel then shows who cancelled it, when and why.
- [ ] `POST .../cancel` on a `completed` order returns 422 `ILLEGAL_TRANSITION`; on an already cancelled order returns 422 `ILLEGAL_TRANSITION`; on an unknown id returns 404 `NOT_FOUND`.
- [ ] If the order was changed by someone else before the cancel landed, the response is 409 `ORDER_CHANGED` and the order is not overwritten.
- [ ] The database rejects an update that sets `status = 'cancelled'` without all three cancellation fields (direct SQL attempt).
- [ ] After cancelling, filtering the orders list by cancelled shows that order, and its items and prices are intact.
- [ ] The status buttons from LAB-16 are not shown on a cancelled order.
- [ ] The server log has an `order.cancelled` line with ids only and no note or name text.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 2).
- [ ] Checkpoint 2: once LAB-13 to LAB-17 had all merged, the AI exploratory browser pass ran the Checkpoint 2 section of docs/acceptance-checklist.md against everything merged so far (live preview, filters, detail panel, status changes, cancel); each bug found got a failing test in the right layer before it was fixed, on its own branch; the run and its findings are recorded in docs/process.md.
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.

## Tests

- **Unit** (`src/shared/`): the cancel request body schema: trims whitespace, accepts 500 and 100 characters, rejects 501 and 101, rejects blank and unknown fields. The transition rows are owned by LAB-15.
- **Integration** (real Postgres): cancel from `ordered`; cancel from `collected`; 422 from `completed`; 422 from `cancelled`; 404; 400 for missing note, missing name and blank values; 409 on lost race; the CHECK constraint rejects a cancelled row missing any one of the three fields; the three fields are stored and returned.
- **e2e:** none here. The cancel journey is covered in LAB-21.

## Docs to update

- `docs/data-model.md` and its diagram: the three new columns and the constraint.
- `docs/api.md`: the cancel endpoint, and the new `cancellation` field on the order.
- `docs/data-flow.md`: the cancel flow.
- `docs/acceptance-checklist.md`: add the cancel checks under Checkpoint 2.
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry; record the no-login assumption here.

## Out of scope

- Cancelling a `completed` order, voiding or amending it: future version with its own audit trail.
- Taking the name from a signed-in user: future version (login and roles).
- Reopening or un-cancelling an order: not allowed.
- Browser test of the cancel journey: LAB-21.

## What to be able to explain

1. Why do we require both a note and a name, and why is the name typed in instead of taken from a user?
2. Why does the database have a CHECK constraint for the three cancellation columns when the code already validates them?
3. Why is cancel a separate endpoint and not another `to` value on transitions?
4. Why can an order be cancelled from `collected` but not from `completed`?
5. Why is the cancel form inside the panel and not a second pop-up, and why are the note and name left out of the logs?
