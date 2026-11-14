# Data flow

How a request travels from the screen to the database and back, shown for the main actions.

Kept up to date by each task that adds an action.

## An error, from the server to the screen

The path of a failed request, here a `ConflictError` thrown by the catalog repository (a duplicate lab test code, LAB-06), and what the user reads.

```mermaid
sequenceDiagram
  participant U as User
  participant P as Page (React)
  participant Q as TanStack Query
  participant C as apiFetch
  participant V as Vite proxy
  participant A as API (Fastify)

  U->>P: submits the form
  P->>Q: mutate
  Q->>C: apiFetch('/api/lab-tests', { method: 'POST', body })
  C->>V: POST /api/lab-tests
  V->>A: POST /api/lab-tests
  Note over A: onRequest: request id taken from x-request-id or a new UUID
  A->>A: insert hits the unique constraint (23505), repo throws ConflictError('DUPLICATE_TEST_CODE', 'This code already exists')
  Note over A: route: warn line lab_test.duplicate_code; error handler: toErrorResponse, warn line request.rejected
  A-->>V: 409 { error: { code, message, requestId } }
  V-->>C: 409, same body
  Note over C: body matches errorBodySchema (src/shared)
  C-->>Q: throws ApiError(409, code, message, requestId)
  Q-->>P: error (a mutation is never retried)
  P->>P: the form puts error.message under the Code field
  P-->>U: "This code already exists" under Code
```

The add form shows a 409 `DUPLICATE_TEST_CODE` and a 400's `details` under their fields; any other failure is shown above its button by `ErrorMessage` with `describeError`, which ends with "Reference: <requestId>". The list on the page shows a failed load the same way, with a "Try again" button.

- **Where the request id comes from:** the API picks it for every request (the caller's `x-request-id` when it is sane, otherwise a new UUID), puts it on every log line for the request and in the error body. The user quotes the reference; a developer finds the matching log lines with it.
- **When the API is down:** the proxy answers `502` with no standard body, so `apiFetch` throws `ApiError` with code `SERVER_UNREACHABLE`; a query retries once, then the page shows "Can't reach the server. Try again." with no reference (there is no request id, because the API never saw the request).
- **A 500:** the body is in the standard shape with the generic message; `describeError` shows "Something went wrong on the server. Try again. Reference: <id>", and the stack is only in the server log under that id.
- **A render error** (a bug in a component) never reaches this path: the error boundary shows "Something went wrong. Reload the page."

## A date of birth, from the form to the database and back

A date of birth is a calendar day and stays a `YYYY-MM-DD` string at every step; nothing on the way builds a JavaScript `Date` from it.

```mermaid
sequenceDiagram
  participant F as PatientForm
  participant A as API (POST /api/patients)
  participant D as Postgres
  participant L as Patients list

  F->>F: user types 1984-03-09 (a text field)
  Note over F: createPatientBody(latestTodayAnywhere(new Date())): real date, not after the latest day anywhere (advisory)
  F->>A: { "dateOfBirth": "1984-03-09", ... }
  Note over A: createPatientBody(today(CLINIC_TIMEZONE, clock())): the check that decides
  A->>D: insert ... $3 = '1984-03-09' (a date column)
  D-->>A: date_of_birth '1984-03-09' (the DATE type parser keeps the string)
  A-->>F: 201 { "dateOfBirth": "1984-03-09" }
  L->>A: GET /api/patients
  A-->>L: [{ "dateOfBirth": "1984-03-09" }]
  Note over L: formatDate splits the string: "Mar 9, 1984"
```

- **"Today" is the clinic's.** The server asks `today(CLINIC_TIMEZONE, clock())`, so a date of birth of the clinic's today is accepted even when it is already tomorrow in UTC, and the clinic's tomorrow is refused. The browser does not know the clinic's time zone, so it checks against the latest day anywhere on Earth (`latestTodayAnywhere`, UTC+14): it catches a date that is plainly in the future, never blocks one the clinic accepts, and the server's answer wins.
- **A rejected value goes back as a field problem**, `{ field: "dateOfBirth", reason: "..." }` in `details`, and the form shows it under the date of birth. The value itself is never logged.

## A new patient, through the duplicate check

`POST /api/patients` (LAB-10). The body is parsed first, so a bad body is a 400 and is never reported as a duplicate. Then the patients service runs the check, unless the body says `confirmDuplicate: true`.

```mermaid
sequenceDiagram
  participant F as NewPatientPage
  participant A as API (route, then patients service)
  participant D as Postgres

  F->>A: POST { firstName, lastName, dateOfBirth, email, phone }
  Note over A: parse(createPatientBody): 400 VALIDATION_ERROR if wrong
  A->>D: findDuplicateCandidates: lower(email) = $1 or phone = $2 or (names, date of birth), no limit
  D-->>A: candidate rows
  Note over A: matchRules(body, row) for each: email, phone, name_dob; keep the matches, list the first 10
  alt at least one match
    Note over A: warn patient.possible_duplicate (count, rule names); debug the ids
    A-->>F: 409 POSSIBLE_DUPLICATE, error.matches, nothing inserted
    Note over F: DuplicateWarning above the form, which keeps its values
    alt Open this patient
      F->>F: go to /patients/:id (nothing created)
    else Create anyway
      F->>A: the same body plus confirmDuplicate: true
      A->>D: insert (no check)
      A-->>F: 201, info patient.created duplicateConfirmed: true
    else the user edits a field
      Note over F: the warning goes away; the next Save checks again
    end
  else no match
    A->>D: insert
    A-->>F: 201, info patient.created
  end
```

The check and the insert are two statements with no lock between them, so two identical creates sent at the same moment can both pass the check and both insert. That is accepted for this version: the rule warns, it does not guarantee. Editing a patient (`PATCH`) skips all of this.

## The orders list, from the database to the home page

`GET /api/orders` (LAB-11) in one query, and the two derived values on the way.

```mermaid
sequenceDiagram
  participant P as OrdersPage
  participant A as API (GET /api/orders)
  participant D as Postgres

  P->>A: GET /api/orders (TanStack Query, key ['orders'])
  A->>D: one select: orders join patients, left join order_items,<br/>array_agg(price_cents) per order, newest first, id breaks ties
  D-->>A: one row per order with item_prices [2500, 3800]
  Note over A: toOrderListItem: testCount = item_prices.length,<br/>totalCents = calculateTotal(item_prices),<br/>createdAtClinic = clinicDateTime(CLINIC_TIMEZONE, created_at)
  A-->>P: { items, hasMore: false, clinicTimezone }
  Note over P: orderListSchema.parse; PatientLabel, formatCents,<br/>formatDate, StatusBadge, formatDateTime(createdAtClinic)
```

- **One query, however many orders.** The patient comes by a join and the item prices as one array per order, so there is no query per row.
- **The total is worked out here, every time,** by `calculateTotal` on the frozen item prices; the database has no total column and the SQL has no `SUM`. The ready date is read as stored: it was worked out once, when the order was placed.
- **The created time is formatted on the server** in `CLINIC_TIMEZONE` and shown as sent, so a browser in another time zone still shows the clinic's time, and the column header names the zone.
- **Nothing about a patient is logged:** the request line (`request.completed`) and one `db.query` debug line are all.

## One order, from the database to the panel

`GET /api/orders/:id` (LAB-15), opened from a row or from `?order=<id>` in the address.

```mermaid
sequenceDiagram
  participant P as OrderDetailPanel
  participant A as API (GET /api/orders/:id)
  participant D as Postgres

  P->>A: GET /api/orders/<id> (TanStack Query, key ['orders', id])
  A->>D: select the order joined to its patient
  D-->>A: one row, or none (404 NOT_FOUND)
  A->>D: select the order_items rows of the order
  D-->>A: code, name, price, turnaround per item
  Note over A: totalCents = calculateTotal(items),<br/>allowedNextStatuses and canCancel from the transition table,<br/>createdAtClinic = clinicDateTime(CLINIC_TIMEZONE, created_at)
  A-->>P: the order
  Note over P: orderDetailSchema.parse; StatusBadge, PatientLabel,<br/>formatCents, formatDate, formatDateTime(createdAtClinic)
```

- **Two reads, no catalog.** The items are the frozen `order_items` rows, so a later price change in the catalog cannot change what the panel shows.
- **The id is checked before the database.** A string that is not a uuid is a 400 and never reaches Postgres; a well-formed id with no order is a 404. The panel does not even ask for an address that is not a uuid: it shows "Order not found".
- **The panel's state is in the address.** Clicking a row adds `?order=<id>` (a history entry); the page renders the panel while it is there, and closing or going back removes it.
- **Nothing about the patient is logged:** the request line, a `db.query` line per query, and `order.loaded` with the id and the item count.

## Placing an order, from the modal to the database

`POST /api/orders` (LAB-12, LAB-18): the New order modal, the service and its one transaction, with the replay branch for a key already used.

```mermaid
sequenceDiagram
  participant M as NewOrderModal
  participant R as Route (POST /api/orders)
  participant S as Service (createOrder)
  participant D as Postgres

  Note over M: patient from usePatientSearch, tests from the catalog<br/>(GET /api/lab-tests) through matchTests
  Note over M: key = crypto.randomUUID(), once per opening
  M->>R: { patientId, labTestIds }, Idempotency-Key: key (useMutation)
  Note over R: parse(createOrderHeaders): 400 for a key that is not a uuid<br/>parse(createOrderBody): 400 for a missing field,<br/>a non-uuid id or an unknown field
  R->>S: createOrder(deps, request.log, body, key)
  Note over S: now = clock(), read once
  S->>D: begin
  opt the key already placed an order (a replay)
    S->>D: select the order by its key, read it as a list row
    S->>D: commit (nothing written, the body not checked)
    R-->>M: 200 that order; log warn order.create_replayed
  end
  S->>D: select the tests by id ... for share
  Note over S: checkOrderTests: empty, repeated, unknown, inactive<br/>-> 422 INVALID_ORDER_TESTS (rollback, nothing saved)
  Note over S: estimateReadyDate(now, tests, CLINIC_TIMEZONE)
  S->>D: insert order (status ordered, ready date, created_at = now, key)<br/>on conflict (idempotency_key) do nothing returning id
  Note over D: patient foreign key fails -> 422 UNKNOWN_PATIENT (rollback)<br/>same key in a transaction not yet committed -> wait for it
  alt a row came back: a new order
    S->>D: insert one item per test (code, name, price, turnaround copied)
    S->>D: read the order back as a list row
    S->>D: commit
    R-->>M: 201 the list row (total from calculateTotal); log order.created
  else no row: a request with the same key inserted first (a lost race)
    S->>D: find that order by its key, read it as a list row
    S->>D: commit (nothing was written)
    R-->>M: 200 that order; log warn order.create_replayed
  end
  Note over M: close; invalidate ['orders'], so the list shows it first
```

- **All or nothing.** The catalog read, the order and its items run on one connection in one transaction. A refusal or any failure (a constraint on an item, a lost connection) rolls everything back: there is never an order without all of its items.
- **The server is the authority.** The modal's catalog may be stale. The tests are read again inside the transaction and locked (`FOR SHARE`) until it commits, so a test deactivated after the modal loaded is refused, and a price change sent at the same moment waits until the order is saved.
- **A snapshot.** Each item copies the test's code, name, price and turnaround. Changing or deactivating the test later never changes the order, its total or its ready date.
- **One `now`.** The clock is read once; the same instant is `created_at` and the moment the ready date counts from.
- **One order per key (LAB-18).** The modal makes one key when it opens and sends it with every submit, so a double click (the button is also disabled while the request runs) or a retry after a timeout or a lost reply places one order: the first request places it (201), any repeat gets that order (200), which the modal treats as a success. A repeat is answered by the lookup at the start of the transaction, before the tests are checked, so it gets the first order even if a test was deactivated since. The lookup alone could not stop a race (two requests can both find nothing), so the unique index decides that: the second insert waits for the first transaction and then finds the conflict, and returns the first request's order. Closing the modal (after a success, Cancel or Escape) unmounts it, so the next opening has a new key.
- **No closing while a submit is in flight (LAB-18).** Until the reply arrives, Cancel is disabled, Escape is stopped at the key press and any other close request is refused at the dialog's `cancel` event (there is no close button, and a backdrop click never closes it), so the user always learns whether the order was placed. Any reply ends it: a success closes the modal; an error reply or a failure to reach the server shows the message and makes the modal closable again, with the same key for a retry. So that a server which takes the request and never answers cannot lock the modal, the create request gives up after 30 seconds (`CREATE_ORDER_TIMEOUT_MS` in `src/web/orders/api.ts`) and shows "Can't reach the server. Try again." The order may still be placed after that; a retry sends the same key and gets it back (200) instead of placing a second one.
- **On a refusal** the modal stays open with the patient and the tests as they were, and shows the server's message with the request id (`ErrorMessage`).

## The live total and ready date, while building an order

`POST /api/orders/quote` (LAB-13): the summary under the chosen tests in the New order modal.

```mermaid
sequenceDiagram
  participant M as NewOrderModal / OrderPreview
  participant R as Route (POST /api/orders/quote)
  participant S as Service (quoteOrder)
  participant D as Postgres

  Note over M: the set of chosen tests changes (add or remove)
  M->>R: { labTestIds } (useQuery, key = the sorted ids)
  R->>S: quoteOrder(deps, request.log, body)
  Note over S: now = clock()
  S->>D: select the tests by id (readOrderTests, no transaction)
  Note over S: checkOrderTests: the same function as create<br/>-> 422 INVALID_ORDER_TESTS
  Note over S: calculateTotal(items), readyDateFor(now, items)
  R-->>M: 200 { items, totalCents, estimatedReadyDate } (nothing saved)
  Note over M: show the total and ready date
```

- **Nothing is calculated in the browser.** The summary shows what the server sent; the rules live in `domain/total.ts` and `domain/ready-date.ts` only.
- **One request per change of the chosen tests**, none while typing in quick-add, none with no tests (the summary says "Add a test to see the total").
- **While a new quote loads**, the previous numbers stay but are dimmed and marked "Updating…", so they are not read as current.
- **A failed quote** shows a quiet line with the request id. "Submit order" stays usable: the server recalculates on submit and decides.
- **Preview equals saved** when placed at the same moment: both call `checkOrderTests`, `calculateTotal` and `readyDateFor` with the same clock and clinic time zone. If the day rolls over between the preview and the submit, the saved order has the later date.

## Changing an order's status, from the panel to the database

`POST /api/orders/:id/transitions` (LAB-16): read, check, then a conditional update.

```mermaid
sequenceDiagram
  participant P as OrderDetailPanel
  participant R as Route
  participant S as Service (changeOrderStatus)
  participant D as Postgres

  P->>R: { to: "collected" } (useMutation; the button is disabled)
  Note over R: parse: 400 for a non-uuid id, a missing or<br/>unknown to, to: "cancelled", or an extra field
  R->>S: changeOrderStatus(deps, log, id, body)
  S->>D: select the order (getOrder)
  D-->>S: none: 404 NOT_FOUND
  Note over S: assertTransition(status read, to)<br/>not allowed: 422 ILLEGAL_TRANSITION, nothing written
  S->>D: update orders set status = to, updated_at = now()<br/>where id = id and status = status read
  alt one row changed
    S->>D: select the order again
    R-->>P: 200 the order (new allowedNextStatuses); log order.status_changed
    Note over P: set ['orders', id]; invalidate ['orders'] so the list refreshes
  else no row changed (someone else changed it first)
    R-->>P: 409 ORDER_CHANGED; log order.transition_lost_race
    Note over P: "This order was changed by someone else";<br/>invalidate ['orders'], so the panel reloads the real status
  end
```

- **Two people at once.** Both requests can read `ordered` and pass the check. The update's `status = <status read>` condition lets only the first change the row; the second finds no row at `ordered`, changes nothing and gets the 409. Without the condition both would succeed, and the second would silently write over the first.
- **The 422 and the 409 are different paths.** The check refuses an illegal move before any update is tried; the 409 only ever comes from an update that changed no row.
- **Two tabs, one after the other.** If one tab marks the order collected and a tab still showing `ordered` presses the same button a moment later, the server reads `collected` and the check refuses `collected` to `collected`: a 422, not a 409. The 409 is only for two requests whose read and update overlap. Either way the panel reloads the order, so the second tab shows the real status. The owner accepted this for this version; the alternative is in `docs/plan/backlog.md`.
- **What changes.** Only `status` and `updated_at`; the stored ready date stays.

## Cancelling an order, from the panel to the database

`POST /api/orders/:id/cancel` (LAB-17): the same read, check and conditional update as a status change (the service's `moveOrder`, shared by both), with the note, the name and the time written in the same update.

```mermaid
sequenceDiagram
  participant P as OrderDetailPanel
  participant R as Route
  participant S as Service (cancelOrder)
  participant D as Postgres

  Note over P: "Cancel order" only when canCancel;<br/>the form checks note and name with cancelOrderBody
  P->>R: { note, cancelledBy } (useMutation; Confirm cancel is disabled)
  Note over R: parse: 400 for a non-uuid id, a missing, blank or<br/>too long note or name, or an extra field
  R->>S: cancelOrder(deps, log, id, body)
  S->>D: select the order (getOrder)
  D-->>S: none: 404 NOT_FOUND
  Note over S: assertTransition(status read, cancelled)<br/>completed or cancelled: 422 ILLEGAL_TRANSITION, nothing written
  S->>D: update orders set status = cancelled, note, name,<br/>cancelled_at = now(), updated_at = now()<br/>where id = id and status = status read
  alt one row changed
    S->>D: select the order again
    R-->>P: 200 the order with its cancellation; log order.cancelled (id, from)
    Note over P: set ['orders', id]; invalidate ['orders'] so the list refreshes;<br/>the panel shows "Cancelled by NAME on DATE: NOTE"
  else no row changed (someone else changed it first)
    R-->>P: 409 ORDER_CHANGED; log order.cancel_lost_race
    Note over P: the message; invalidate ['orders'], so the panel reloads the real state
  end
```

- **One list of what can be cancelled.** The transition table says `ordered` and `collected` may go to `cancelled`; `canCancel` in the response and the check in the service both read it.
- **All at once.** The status, note, name and time change in one statement, which the database's CHECK requires: there is never a cancelled row without its reason and name.
- **What is kept.** The order row and its items stay as they were; only the status, the three cancellation fields and `updated_at` change. A cancelled order shows in the list under the cancelled filter.
- **What is not logged.** The note and the name, which are free text typed by staff.
