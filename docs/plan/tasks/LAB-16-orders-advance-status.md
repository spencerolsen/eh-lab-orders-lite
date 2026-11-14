# LAB-16: Orders: mark an order collected or completed

- **Status:** In progress
- **Type:** Vertical slice
- **Depends on:** LAB-15 (Orders: order detail slide-out panel)
- **Unblocks:** LAB-17 (Orders: cancel an order with a note and a name)
- **Branch:** `lab-16-orders-advance-status`

## Description

After this task, a user can open an order and press a button to mark it collected, and later completed. Only the move that is allowed from the current status is offered. If two people act on the same order at once, one succeeds and the other gets a clear "this order changed" message.

This is the first task that changes an order after it is placed, so it is where the race-safe update is built and tested. It follows the read-only panel (LAB-15), which already tells the browser which moves are allowed and owns the transition table. This task adds one endpoint, the read, check, conditional-update flow, the buttons and the logs. Cancelling is a separate task (LAB-17) because it needs its own data, form and rules.

## Requirements

**Data**
- No migration. The `orders.status` check constraint and `updated_at` already exist. There is no trigger on `updated_at`: the conditional `UPDATE` sets it (`updated_at = now()`), and no trigger should be added.

**API**
- `POST /api/orders/:id/transitions` with body `{ "to": "collected" | "completed" }`; the allowed `to` values are the forward statuses derived from `ORDER_STATUSES` (LAB-11) and the transition table (LAB-15), not a second typed list (`ordered` and `cancelled` are not valid targets here). Success: 200 with the updated order in the same shape as `GET /api/orders/:id`.
- Order of work in `src/server/orders/service.ts`, kept in this order so each failure has its own code:
  1. Read the order. Missing: 404 `NOT_FOUND`.
  2. Call `assertTransition(current, to)` from LAB-15. Illegal: 422 `ILLEGAL_TRANSITION` with a message naming the current status and the requested one.
  3. Run `UPDATE orders SET status = $to, updated_at = now() WHERE id = $id AND status = $previous`. If zero rows changed, someone else moved it between this request's read and its update: 409 `ORDER_CHANGED`. A request sent from an out-of-date screen (the order was moved before this request read it) is judged by step 2 against the status it reads now, so it gets 422 `ILLEGAL_TRANSITION`, not 409; the owner accepted this for this version (see `docs/plan/backlog.md`).
- Body not matching the schema (missing `to`, not a string, any value other than `collected` or `completed`, unknown extra fields): 400 `VALIDATION_ERROR`. `to: "cancelled"` is rejected here with 400 `VALIDATION_ERROR` because cancelling has its own endpoint in LAB-17.
- Malformed `:id`: 400 `VALIDATION_ERROR`.

**Rules**
- The transition table and `assertTransition` are reused from LAB-15 unchanged. This task writes no second list of legal moves.

**UI**
- In the panel, one button for each entry in `allowedNextStatuses` ("Mark collected", "Mark completed"). No button for a move that is not allowed; a final order shows none.
- While the request runs the button is disabled. On success the panel shows the new status and the orders list behind it refreshes through TanStack Query invalidation, with no page reload.
- On 409 the panel shows "This order was changed by someone else", reloads the order and shows its real status. On 422 or 500 it shows the message and the request id; on 422 it also reloads the order, because the button was offered from the status the panel showed, so a 422 means the order moved since the panel loaded it.

**Logging**
- `info` `order.status_changed` with `orderId`, `from`, `to`.
- `warn` `order.transition_refused` for an illegal move (id and both statuses).
- `warn` `order.transition_lost_race` for the zero-row update (id, expected status).
- No patient data on any line.

## Acceptance criteria

- [ ] An `ordered` order shows only "Mark collected"; after pressing it the panel shows `collected` and only "Mark completed".
- [ ] After "Mark completed" the order shows `completed` and no status buttons.
- [ ] The status badge in the orders list behind the panel changes without a reload.
- [ ] `POST .../transitions` with `{ "to": "completed" }` on an `ordered` order returns 422 `ILLEGAL_TRANSITION` and the status is unchanged.
- [ ] `POST .../transitions` on a `completed` order returns 422 `ILLEGAL_TRANSITION` for either allowed `to` value.
- [ ] `POST .../transitions` on an unknown order id returns 404 `NOT_FOUND`.
- [ ] A missing `to`, an unknown `to`, and `to: "cancelled"` each return 400 `VALIDATION_ERROR`.
- [ ] If another request moves the order between this request's read and its update, this request returns 409 `ORDER_CHANGED` and the panel tells the user and shows the current status. (If the other request finished before this one read the order, as with a second tab left open, this one gets 422 `ILLEGAL_TRANSITION` and the panel reloads to the current status: an accepted limitation, `docs/plan/backlog.md`.)
- [ ] `updated_at` changes on a successful transition and `estimated_ready_date` does not.
- [ ] A refused or lost-race request is logged at `warn`, a successful one at `info`, and no line contains a name or date of birth.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 2).
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.

## Tests

- **Unit:** none. The table is tested in LAB-15 and not re-tested here.
- **Integration** (real Postgres): ordered to collected to completed succeeds; skip returns 422; transition out of completed returns 422; unknown id 404; invalid body 400, including `to: "cancelled"`; the lost race is tested with no hook in production code, in two parts: (1) the repository's conditional update is called with a stale previous status and returns zero rows updated, and the stored status is not overwritten; (2) one service-level test (the orders repository module stubbed with Vitest's `vi.mock` so the conditional update reports zero rows) shows that zero rows maps to 409 `ORDER_CHANGED`.
- **e2e:** none here. The journey is covered in LAB-21.

## Docs to update

- `docs/api.md`: add the transitions endpoint, its body, and the 400, 404, 422 and 409 cases.
- `docs/architecture.md`: why the service does read, check, update; add the three new log events to the logging section.
- `docs/data-flow.md`: add the status-change flow, including the lost-race branch.
- `docs/acceptance-checklist.md`: add the checks above under Checkpoint 2.
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.

## Out of scope

- Cancelling, its note and name, and the cancel form: LAB-17.
- Browser tests of the status journey: LAB-21.
- An audit trail of who changed the status: future version (there is no login).
- Per-test status and results: future version.
- Undoing or reversing a status: not allowed in this version.

## What to be able to explain

1. Why are the three failures (missing order, illegal move, lost race) three different status codes, and what does the user do differently for each?
2. What does `WHERE status = previous` protect against, and what happens without it when two people click at once?
3. Why is `cancelled` rejected at this endpoint with 400 when it is a legal target in the table?
4. How does the list behind the panel stay up to date after a change?
5. Why does this task add no unit tests, and where is the transition table tested?
