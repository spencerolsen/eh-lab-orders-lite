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
  A->>D: findDuplicateCandidates: lower(email) = $1 or phone = $2 or (names, date of birth), limit 10
  D-->>A: candidate rows
  Note over A: matchRules(body, row) for each: email, phone, name_dob
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
