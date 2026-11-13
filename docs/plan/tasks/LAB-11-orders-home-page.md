# LAB-11: Orders: see orders on the home page

- **Status:** Done
- **Type:** Vertical slice
- **Depends on:** LAB-06 (Catalog: see and add lab tests), LAB-08 (Patients: add and list patients)
- **Unblocks:** LAB-12 (Orders: place an order), LAB-14 (Orders: filter the list by status and patient), LAB-15 (Orders: order detail slide-out panel)
- **Branch:** lab-11-orders-home-page

## Description

After this task, a user who opens the app lands on the Orders list and sees seeded orders, newest first, each with the patient's name and date of birth, the number of tests, the total price, the estimated ready date and the status. There is no way to place an order yet; that is LAB-12.

This task builds the order tables and the two business rules that every later orders task relies on: the total and the ready date. They are pure functions with their full unit tests here, so later tasks only call them. The seeded orders are built through those same functions, so the first screen already shows correct data. It comes now because it needs the catalog (LAB-06) and patients (LAB-08), and because placing, filtering and opening orders all build on it.

## Requirements

**Data**
- Migration creates `orders`: `id` uuid, `patient_id` (foreign key to patients, not null), `status` text not null default `ordered` with a check in (`ordered`, `collected`, `completed`, `cancelled`) (the one place besides the code list below that spells out the statuses), `estimated_ready_date` date not null, `created_at`, `updated_at`.
- Migration creates `order_items`: `order_id` (foreign key to orders), `lab_test_id` (foreign key to lab_tests), `test_code`, `test_name`, `price_cents` integer check >= 0, `turnaround_days` integer check >= 1, primary key (`order_id`, `lab_test_id`). The primary key stops the same test appearing twice on one order.
- No total column: the total is always derived from `order_items`.
- `src/shared/` exports `ORDER_STATUSES` (`ordered`, `collected`, `completed`, `cancelled`) and its `OrderStatus` type: the single list in code. The filter schema (LAB-14), the transition table (LAB-15), the transitions' `to` values (LAB-16) and the UI status labels all derive from it; none retypes the list. The database CHECK above is the one other place. A test asserts the CHECK and `ORDER_STATUSES` agree.
- `AGENTS.md` gains a "how to add a status" touch-list: the migration (change the CHECK), `ORDER_STATUSES`, the transition table, and the labels.
- Seed adds exactly 4 obviously fake orders for seeded patients, each with a fixed UUID and inserted with `on conflict (id) do nothing` (order items have no id of their own, so they are inserted `on conflict do nothing` on their primary key), using seeded tests only (CBC, CMP, LIPID, A1C, TSH, UA, VITD, CULT): one test; three tests; one placed on Friday 2026-10-30 at 12:00 in the clinic timezone; one in status `completed`. Items are copied from the catalog and each `estimated_ready_date` comes from `estimateReadyDate` with each order's fixed order time (never "now"), never typed in by hand. Statuses: `ordered` (two), `collected` and `completed`. No order is seeded as `cancelled`: LAB-17's CHECK requires a cancelled order to have its note, name and time, and a cancelled row seeded before those columns exist would make that migration fail.
- An order has at least one item. The database cannot check this with a CHECK (it would need a trigger), so it is enforced in code: `estimateReadyDate` throws for an empty list, and LAB-12 refuses an empty test list with 422 `INVALID_ORDER_TESTS` before anything is written.

**Rules (pure functions in `src/server/orders/domain/`, no framework or database imports)**
- `calculateTotal(items)`: sum of `price_cents`, integer cents, 0 for an empty list.
- `estimateReadyDate(orderedAt, items, timezone)`: the ready date is the Nth business day after the day the order was placed, where N is the longest turnaround among the order's tests. Saturday and Sunday are not business days. The order day itself is never counted. "The day the order was placed" is the calendar day of `orderedAt` in `CLINIC_TIMEZONE` (validated at startup in LAB-02). There is no separate weekend step: Friday, Saturday and Sunday orders with the same tests are ready the same day. Returns a `YYYY-MM-DD` string. Calendar arithmetic is on year-month-day numbers, never a JavaScript `Date`, so the result does not depend on the process time zone. Public holidays are not handled; a list of days to skip could be added later as one more parameter.
- Worked examples, each a unit test: ordered Monday, 1 day = Tuesday, 2 days = Wednesday; Thursday, 2 days = Monday; Friday, 1 day = Monday, 2 days = Tuesday; Saturday or Sunday, 1 day = Monday, 2 days = Tuesday. A separate test shows Friday, Saturday and Sunday orders with the same tests are ready the same day.
- The clock is injected: the caller passes `orderedAt`, read once, so `created_at` and the ready date cannot disagree.

**API**
- `GET /api/orders` returns `{ items, hasMore: false, clinicTimezone }` from the start (not a bare array), newest first (`created_at` desc, `id` desc). Each item: `id`, `status`, `patient { id, firstName, lastName, dateOfBirth }`, `testCount`, `totalCents`, `estimatedReadyDate`, `createdAt`, and `createdAtClinic` (the created time as a clinic-local date-time string in `CLINIC_TIMEZONE`, for example `2026-10-30 12:00`, formatted on the server). The response also includes `clinicTimezone` (the IANA name, for example `America/Denver`) next to `items` and `hasMore`, so the UI can label the column "Created (America/Denver)". No query parameters yet (LAB-14 adds them and real `hasMore` paging).
- The total has one implementation. The list query returns each order's item prices (for example an array aggregate of `price_cents`) and the row mapper passes them through `calculateTotal`; there is no SQL SUM. `calculateTotal` is the single place the total rule lives and it is unit-tested here only.
- Rows pass through the typed mapper; the response is built from a Zod schema in `src/shared/`.

**UI**
- The Orders list is the home page (`/`) and the first navigation item: a plain table with patient name and date of birth, test count, total (dollars on screen only), ready date, status and created time. The created time is shown from `createdAtClinic` (never converted in the browser's timezone) and the column is labelled with `clinicTimezone` from the response, for example "Created (America/Denver)". Status labels derive from `ORDER_STATUSES`. Empty state: "No orders yet". A failed request shows a plain message with the request id.
- No row click, no filters and no buttons yet.

**Logging**
- `debug` on the ready-date inputs and result (counts and the date only): written by the server code that calls `estimateReadyDate`, which first happens in LAB-12 (`POST /api/orders`); the function itself is pure and has no logger, and in this task only the seed calls it. `info` request line as in LAB-03. No names or dates of birth in any line.

## Acceptance criteria

- [ ] After `pnpm dev` on an empty database, the home page shows exactly the 4 seeded orders, newest first.
- [ ] Each row shows the patient's name and date of birth, the test count, the total, the ready date and the status.
- [ ] A row's total equals the sum of its items' `price_cents`, and the `orders` table has no total column.
- [ ] A Monday order with longest turnaround 1 day is ready Tuesday; a Friday order with 1 day is ready Monday; a Saturday or Sunday order with 1 day is ready Monday, and with 2 days Tuesday, the same as a Friday order.
- [ ] A moment that is Friday 06:30 UTC but 11:30 pm Thursday in `CLINIC_TIMEZONE` is treated as Thursday: with 1 day it is ready Friday, not Monday.
- [ ] With the same inputs the function always returns the same date, because it reads no clock of its own.
- [ ] Inserting an `order_items` row with a negative price, a turnaround of 0, or a repeated (order, test) pair is rejected by the database.
- [ ] Running the seed twice leaves the same 4 orders (same ids) and the same items; `pnpm dev` runs it every time.
- [ ] The created time on each row is in the clinic timezone and the column says which timezone; the Friday 2026-10-30 12:00 seeded order shows 12:00 whatever the browser's timezone.
- [ ] `ORDER_STATUSES` is exported from `src/shared/` and matches the database CHECK; AGENTS.md has the "how to add a status" touch-list.
- [ ] With zero orders the page shows "No orders yet".
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 1).
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.

## Tests

**Unit** (`domain/`): `calculateTotal` empty, one item, many items. `estimateReadyDate` for each weekday with 1 day; longest of several turnarounds; a 5-day and a 10-day span over weekends; Friday, Saturday and Sunday orders; Friday, Saturday and Sunday ready the same day; timezone boundary near midnight; same input gives the same output.

**Integration** (real Postgres, HTTP): list newest first with tie-break on id; derived total and test count per row; the 4 seeded orders match `estimateReadyDate` and the catalog values; the three database constraints from the criteria; seed twice leaves the same rows; `createdAtClinic` is in the clinic timezone and the response includes `clinicTimezone` (`America/Denver` in the test setup); the status CHECK and `ORDER_STATUSES` agree.

**Component:** the table renders a row (with the created time and its timezone label), the empty state and the error message.

**E2E:** none here; the journeys are LAB-21.

## Docs to update

- `docs/data-model.md` and its diagram: `orders`, `order_items`, derived total; the status list lives in `ORDER_STATUSES` plus the CHECK.
- `docs/api.md`: `GET /api/orders`, including the row fields `createdAt` and `createdAtClinic` and the response field `clinicTimezone`.
- `AGENTS.md`: the "how to add a status" touch-list (migration, `ORDER_STATUSES`, transition table, labels).
- `docs/architecture.md`: the orders folder and the pure domain functions; where the clock is injected.
- `docs/data-flow.md`: the list-orders flow.
- `docs/acceptance-checklist.md`: the home page checks (Checkpoint 1).
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry; note the ready-date assumptions here (clock starts at order time, business days, no public holidays, tests run in parallel).

## Out of scope

- Placing an order, the New order modal and the patient picker: LAB-12.
- The live total and ready date preview: LAB-13.
- Filters, paging and Load more: LAB-14.
- Opening an order's detail: LAB-15.
- Status changes: LAB-16. Cancelling: LAB-17.
- Public holidays, cut-off times and rush tests: future version.

## What to be able to explain

1. Why is the total derived from the order items while the ready date is stored on the order?
2. Why does the order day come from the clinic timezone, and why is the clock passed in instead of read inside the function?
3. Why do code, name, price and turnaround get copied onto each order item?
4. Why do the domain functions import nothing from the framework or the database, and how does that help the tests?
5. How does the seed create orders, and why does it call the domain functions instead of typing in dates?
6. Why does every seeded row have a fixed id, and what makes running the seed twice safe?
7. Where does the list of statuses live, and what do you touch to add a new one?
8. Why does the API return the created time in the clinic timezone instead of leaving it to the browser?
