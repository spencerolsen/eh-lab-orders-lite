# LAB-15: Orders: order detail slide-out panel

- **Status:** Not started
- **Type:** Vertical slice
- **Depends on:** LAB-11 (Orders: see orders on the home page)
- **Unblocks:** LAB-16 (Orders: mark an order collected or completed), LAB-19 (Patient page: order history)
- **Branch:** `lab-15-orders-detail-panel`

## Description

After this task, a user can click any row in the orders list and see that order in a slide-out panel: the patient, the tests with the prices they were quoted, the total, the ready date and the status. The panel is read-only. Nothing can be changed from it yet.

Every later order action happens inside this panel: moving the status (LAB-16), cancelling (LAB-17), and opening it from the patient page (LAB-19). Building the panel and the single-order endpoint first, with no actions, keeps this review small and gives the next tasks a stable place to add buttons. This task also builds the status transition table, because it decides which buttons the panel will offer. The endpoint reports `allowedNextStatuses` and `canCancel` from that table, so LAB-16 and LAB-17 only show what the server says.

## Requirements

**Data**
- No migration. The endpoint reads `orders`, `patients` and `order_items` as they exist after LAB-11.

**API**
- `GET /api/orders/:id` returns 200 with:
  - `id`, `status`, `estimatedReadyDate` (YYYY-MM-DD), `createdAt`, `createdAtClinic` (the clinic-local created date-time string in `CLINIC_TIMEZONE`, built the same way as in LAB-11) and `clinicTimezone` (the IANA name, for example `America/Denver`) alongside it
  - `patient`: `id`, `firstName`, `lastName`, `dateOfBirth` (YYYY-MM-DD), `email`, `phone`
  - `items[]`: each item uses the order-item response schema (`labTestId`, `testCode`, `testName`, `priceCents`, `turnaroundDays`) that LAB-12 defines once in `src/shared/`; this task reuses it and does not define it again. Items are read from the `order_items` columns, never from `lab_tests`
  - `totalCents`: the sum of the items' `priceCents`, using the total helper LAB-11 built, never stored
  - `allowedNextStatuses`: the forward moves from the current status (`ordered` gives `["collected"]`, `collected` gives `["completed"]`, `completed` and `cancelled` give `[]`)
  - `canCancel`: true only for `ordered` and `collected`
- `:id` that is not a valid uuid: 400 `VALIDATION_ERROR`. A well-formed id with no order: 404 `NOT_FOUND`. Both use the standard error body `{ error: { code, message, details?, requestId } }`.
- The response schema lives in `src/shared/` and is parsed on the server and in the browser.

**Rules**
- A pure transition table in `src/server/orders/domain/`, keyed by the statuses in `ORDER_STATUSES` (LAB-11, the single list in code), and `assertTransition(from, to)`, which throws a domain error for an illegal move. No imports from Fastify or `pg`.
  - `ordered` may go to `collected` or `cancelled`
  - `collected` may go to `completed` or `cancelled`
  - `completed` and `cancelled` are final: no moves out
  - No skipping and no going back
- `allowedNextStatuses` is the table's forward moves (targets other than `cancelled`). `canCancel` is true when `cancelled` is a legal target. Both are decided on the server; the browser does not repeat this logic.
- LAB-16 and LAB-17 call `assertTransition` and add no second list of moves.

**UI**
- One `OrderDetailPanel` component in `src/web/orders/`. Its only prop is the order id. It fetches its own data with TanStack Query and does not receive the order from the list.
- Clicking a row opens the panel. The open order is kept in the URL as `?order=<id>`, so the address can be shared and reloaded. Opening adds a history entry, so the back button closes the panel.
- The panel is a native `<dialog>` shown with `showModal()` and styled to slide in from the right. Closing (Escape, close button, backdrop click, back button) removes `?order=` and returns focus to the row that opened it.
- It shows a loading state, and an error state with the request id when the call fails.
- If `?order=` names an order that does not exist, the panel shows "Order not found" and a close button. The list behind it is unaffected.
- The status is a badge using the shared label for its `ORDER_STATUSES` entry, the total is shown in dollars, and dates are shown as dates. The created time is shown in the clinic timezone and labelled in the same style as the LAB-11 column, "Created (America/Denver)", using `createdAtClinic` and `clinicTimezone` from the API, never the browser's timezone.
- The panel shows no action buttons. LAB-16 and LAB-17 add them.

**Logging**
- `debug`: order loaded, with order id and item count. No `info` line beyond the standard request-finished line. A 404 is `warn` with the order id.

## Acceptance criteria

- [ ] Clicking a row in the orders list opens a panel on the right and the address bar shows `?order=<id>`.
- [ ] The panel shows the patient's name and date of birth, every test with code, name and price, the total, the ready date and the status.
- [ ] The panel's created time is shown in the clinic timezone with its label, whatever the browser's timezone.
- [ ] Reloading the page with `?order=<id>` in the address opens the panel for that order.
- [ ] Pressing Escape closes the panel, removes `?order=` and puts focus back on the clicked row.
- [ ] Pressing the browser back button after opening the panel closes it and stays on the orders list.
- [ ] `GET /api/orders/<unknown uuid>` returns 404 `NOT_FOUND`, and `?order=<unknown uuid>` shows "Order not found".
- [ ] `GET /api/orders/not-a-uuid` returns 400 `VALIDATION_ERROR`.
- [ ] A `completed` or `cancelled` order returns `allowedNextStatuses: []` and `canCancel: false`; an `ordered` order returns `["collected"]` and `true`.
- [ ] No name, date of birth or contact detail appears in the server log for this request.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 2).
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.

## Tests

- **Unit** (`src/server/orders/domain/`, table-driven): every (from, to) pair across the four statuses, each marked legal or illegal; `assertTransition` throws the domain error naming both statuses for each illegal pair; `completed` and `cancelled` have no legal moves; `allowedNextStatuses` and `canCancel` for each of the four statuses. This is the only layer that tests the table.
- **Integration** (real Postgres): returns the full shape for an order with two items, with the items coming from the `order_items` columns (the price-snapshot rule itself is owned and tested by LAB-12, not here); `createdAtClinic` is returned in the clinic timezone and `clinicTimezone` is returned; 404 for unknown id; 400 for malformed id; the patient block matches the stored patient.
- **e2e:** none. The panel journey is covered once in LAB-21.
- The total is not re-tested here; LAB-11 owns it.

## Docs to update

- `docs/api.md`: add `GET /api/orders/:id` with the response fields and status codes.
- `docs/architecture.md`: add the panel, the "open order lives in the URL" rule, and where the transition table lives.
- `docs/data-flow.md`: add the read path for one order.
- `docs/acceptance-checklist.md`: add the panel checks above under Checkpoint 2.
- `AGENTS.md`: note that the panel takes only an id.
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.

## Out of scope

- Buttons to move an order forward, and the race-safe update: LAB-16.
- Cancelling and showing who cancelled and why: LAB-17 (those fields are not returned until then).
- Opening the panel from the patient page: LAB-19.
- Editing an order, printing or exporting it: future version.

## What to be able to explain

1. Why does the panel take only an order id and fetch its own data, instead of being handed the row from the list?
2. Why is the open order kept in the URL, and what do you get from that (linking, reload, back button)?
3. Why are the prices read from the order items and not from the catalog, and what would go wrong otherwise?
4. Why is the transition table a pure function with no database or framework imports, and why does the server return `allowedNextStatuses` and `canCancel` instead of the browser working them out?
5. Which status code does a missing order give, which does a badly formed id give, and why are they different?
