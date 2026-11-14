# LAB-13: Orders: live total and ready date while building an order

- **Status:** Not started
- **Type:** Vertical slice
- **Depends on:** LAB-12 (Orders: place an order)
- **Unblocks:** LAB-18 (Orders: a double-click or retry cannot create a duplicate order), LAB-21 (Browser tests for the main journeys)
- **Branch:** lab-13-orders-live-preview

## Description

After this task, a user building an order sees the total price and the estimated ready date in the New order modal, updating each time a test is added or removed, before pressing "Submit order".

LAB-12 lets a user place an order but hides what it costs and when it will be ready until after it is saved. This task adds one endpoint that answers that question without saving anything, and the summary in the modal. It comes right after LAB-12 because it changes only the modal and adds one read-style endpoint. The rules it shows are the ones LAB-11 built; nothing is calculated a second time in the browser.

## Requirements

**API**
- `POST /api/orders/quote`, body `{ labTestIds: string[] }`, parsed explicitly with a Zod schema from `src/shared/`. Returns 200 `{ totalCents, estimatedReadyDate, items: [{ labTestId, testCode, testName, priceCents, turnaroundDays }] }`. Each item uses the order-item response schema that LAB-12 defines once in `src/shared/`; this task reuses it and does not define the shape again.
- It calls the same `calculateTotal` and `estimateReadyDate` as `POST /api/orders`, with the same clinic timezone and one `now` taken from the injected `clock` in `buildApp(deps)` (LAB-03). There is no second copy of the rules.
- The test-list checks (empty, repeated, unknown, inactive) live in one function shared by quote and create. Create's behaviour from LAB-12 does not change.
- It saves nothing: no order, no items.
- 400 `VALIDATION_ERROR` for a malformed body, including unknown extra fields. 422 `INVALID_ORDER_TESTS` for an empty list, a repeated id, an unknown id or an inactive test, with `details` naming the ids. It takes no patient, so there is no patient check.
- Error shape `{ error: { code, message, details?, requestId } }`.

**UI**
- A summary under the chosen tests shows the total (dollars on screen) and the ready date. It refreshes through TanStack Query whenever the set of chosen tests changes; the previous result stays visible while the new one loads.
- With no tests chosen it shows "Add a test to see the total" and makes no request.
- If the quote call fails, the summary shows a plain message with the request id and "Submit order" stays usable.
- "Submit order" still calls `POST /api/orders`. The preview is information only; the server recalculates on submit.

**Logging**
- `debug` with the item count only. A refused quote logs `warn`. Nothing is logged at `info`, because nothing happened.

**Note from the LAB-12 review:** reuse `readOrderTests` from `src/server/orders/service.ts` (its `FOR SHARE` is harmless outside a transaction), and move the items-to-ready-date lines of `createOrder` into one small function both call, so the preview and the stored order cannot drift.

## Acceptance criteria

- [ ] Adding CBC to an empty order shows CBC's catalog price as the total and a ready date.
- [ ] Adding a second test updates the total to the sum of both prices; removing it restores the first total and date.
- [ ] The total and ready date shown before submit equal the ones the saved order shows in the orders list.
- [ ] With the longest-turnaround test removed, the ready date changes to match the remaining longest turnaround.
- [ ] With no tests chosen the modal shows "Add a test to see the total" and no quote request is sent.
- [ ] Calling the quote endpoint twice leaves the `orders` and `order_items` row counts unchanged.
- [ ] Quote with an inactive test returns 422 `INVALID_ORDER_TESTS` (proving the shared validator is wired in; the other 422 cases are owned by LAB-12); a malformed body returns 400 `VALIDATION_ERROR`.
- [ ] Quote and create return identical `totalCents` and `estimatedReadyDate` for the same test list with the same injected `clock` time.
- [ ] If the quote request fails, "Submit order" still works and the summary shows the request id.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 2).
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.

## Tests

**Integration** (real Postgres, HTTP): quote returns the same total and ready date as creating the same order, using the `clock` dependency of `buildApp(deps)` set to one fixed time (`clock` is one of the only dependencies `buildApp` takes; no test-only hooks in production code); quote writes nothing (row counts before and after); one 422 case only, to prove the shared validator is wired in ("an inactive test returns 422 INVALID_ORDER_TESTS"; the other 422 cases are owned by LAB-12); 400 shapes. The ready-date rule itself is not retested; LAB-11 owns it, and the list-validation rule is owned by LAB-12.

**Component:** summary shows the placeholder with no tests; shows values after a quote; keeps the old values while loading; shows the request id on failure and leaves "Submit order" enabled.

**E2E:** none here; the preview-equals-saved check is part of LAB-21.

## Docs to update

- `docs/api.md`: `POST /api/orders/quote`, with an example request and response.
- `docs/data-flow.md`: the preview flow beside the place-an-order flow.
- `docs/architecture.md`: quote and create share the domain functions and the test-list validation.
- `docs/acceptance-checklist.md`: add the preview checks under Checkpoint 2.
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.

## Out of scope

- Duplicate-order protection on submit: LAB-18.
- Quoting for a particular patient, discounts or taxes: future version.
- Showing the preview anywhere other than the New order modal: future version.
- Browser-level journey tests: LAB-21.

## What to be able to explain

1. Why does the quote endpoint call the same domain functions as order creation instead of the browser computing the total?
2. Why does the server recalculate on submit even though the user saw a preview?
3. Why is the quote a POST that saves nothing, and which status and error code does it return for an inactive test?
4. Why is the test-list validation one shared function used by both endpoints?
5. What happens to the summary and to "Submit order" if the quote request fails, and why?
