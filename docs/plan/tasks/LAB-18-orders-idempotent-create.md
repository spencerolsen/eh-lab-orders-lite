# LAB-18: Orders: a double-click or retry cannot create a duplicate order

- **Status:** Not started
- **Type:** Hardening
- **Depends on:** LAB-13 (Orders: live total and ready date while building an order)
- **Unblocks:** LAB-20 (New order from the menu bar and the patient page), LAB-21 (Browser tests for the main journeys)
- **Branch:** `lab-18-orders-idempotent-create`

## Description

This task makes placing an order safe to repeat. After it, a double-click on the "Submit order" button, a slow network that makes the browser retry, or a second tab sending the same request creates one lab order, not two. A repeat of the same request returns the order that already exists.

It comes after the New order modal is complete (LAB-13) so that it does not collide with the modal and create-path work, and it protects that flow without changing what a user sees when things go well. A duplicate lab order is a real cost (two specimens, two charges), so the guard is a minimal, correct version: a key made by the browser, stored on the order in a unique column. Expiring old keys and scoping keys per user are known limits, recorded in the docs/process.md entry and gathered in the README by LAB-22, not built.

## Requirements

**Data**
- A migration adding `orders.idempotency_key text`, nullable, with a unique index (nulls are allowed many times). Orders created before this task keep a null key.

**API**
- `POST /api/orders` reads an optional `Idempotency-Key` header. A valid key is a uuid string; any other non-empty value is 400 `VALIDATION_ERROR`.
- With a key, the order insert uses `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING ...` inside the existing all-or-nothing transaction.
  - A row came back: the order and its items were created. Respond 201 as before.
  - No row came back: the key already exists. Read the existing order and respond 200 with the same body shape and nothing else written. Items are not inserted a second time.
- Without a key the endpoint behaves exactly as in LAB-12 (201, no protection).
- Two requests with the same key at the same moment produce one order. The unique index decides the winner; the loser returns the winner's order with 200, never 500 or 409.
- A replay returns the stored order as it was created, even if the body differs. Comparing the second body with the first is not done.

**UI**
- The New order modal generates a key with `crypto.randomUUID()` each time it opens and sends it as `Idempotency-Key` on submit. The same key is reused if the user retries after an error in the same modal session; closing and reopening makes a new key.
- The "Submit order" button is disabled while the request is in flight and shows a pending label.
- A 200 reply is treated as success, the same as 201: the modal closes and the list refreshes.

**Rules**
- A key is tied to one order only. It never expires in this version.

**Logging**
- `warn` `order.create_replayed` with the existing `orderId` and the key (a random id, not personal data) when a replay is detected. No `order.created` `info` line on a replay, since nothing was created.

**Tooling**
- Concurrency tests fire two real simultaneous requests at Postgres, not a mock.

## Acceptance criteria

- [ ] Sending the same `POST /api/orders` twice with the same key returns 201 then 200, with the same order id.
- [ ] After those two calls there is exactly one row in `orders` and one set of rows in `order_items` for that key.
- [ ] Two requests sent at the same time with the same key create exactly one order and both return that order's id (one 201, one 200).
- [ ] Two requests with different keys create two orders.
- [ ] A request with no key still creates an order and returns 201.
- [ ] A request with a malformed `Idempotency-Key` returns 400 `VALIDATION_ERROR` and creates nothing.
- [ ] Double-clicking "Submit order" in the modal creates one order in the list.
- [ ] The "Submit order" button is disabled while the request runs.
- [ ] Closing and reopening the modal and submitting again creates a new order (new key).
- [ ] A replay writes a `warn` line `order.create_replayed` with no patient data, and no second `order.created` line.
- [ ] This slice's manual checks (the double-click check) are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 3).
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request, and the entry lists the limitations: keys never expire, keys are not scoped per user, a replay with a different body is not detected (including the changed-patient case in the known limitation under Out of scope).

## Tests

- **Unit:** none. The rule lives in the database constraint and the service flow, not in a pure function.
- **Integration** (real Postgres): replay returns 200 with the same order; one row after replay; simultaneous same-key requests create one order; different keys create two; no key creates an order; malformed key is 400; the unique index rejects a direct duplicate insert.
- **e2e:** none here. The double-click check is in docs/acceptance-checklist.md; the main journey test is LAB-21.
- The disabled in-flight button is checked by the acceptance checklist, not an automated test.

## Docs to update

- `docs/data-model.md` and its diagram: `idempotency_key` and its unique index.
- `docs/api.md`: the `Idempotency-Key` header, 201 versus 200, and the 400 case.
- `docs/data-flow.md`: the create flow with the replay branch.
- `docs/acceptance-checklist.md`: add the double-click check under Checkpoint 3.
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why, including why a browser-made key and why `ON CONFLICT DO NOTHING`) and test log entry.

## Out of scope

- Expiring old keys: future version.
- Scoping keys per user: needs login, future version.
- Rejecting a reused key with a different body: future version.
- Known limitation: If a submit fails after the server already created the order, and the user then changes the patient or tests in the same open modal and resubmits, the server returns the first order as a success. Accepted by the candidate for this exercise; the fix (a new key whenever the content changes, plus a server-side fingerprint check returning 422) is recorded in the README's known limitations.
- Idempotency for transitions and cancel: already safe through the conditional update (LAB-16, LAB-17).
- Duplicate patient detection: LAB-10.

## What to be able to explain

1. Why is the key made by the browser when the modal opens, and not by the server?
2. What does `ON CONFLICT DO NOTHING` do, and why is it safe when two requests arrive at the same instant, where "check then insert" is not?
3. Why does a replay return 200 and not 201, and why not an error?
4. What are the three documented limitations, and how would you fix each?
5. Why do we still disable the button if the server already guards against duplicates?
6. What goes wrong if a submit fails after the order was created, and the user changes the patient in the same open modal and resubmits? Why was it accepted here, and what is the fix (new key when the content changes, plus a server-side fingerprint check returning 422)?
