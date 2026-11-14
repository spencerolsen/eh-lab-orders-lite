# API

Every endpoint the server offers, with its request and response bodies, status codes and error codes.

Feature endpoints live under `/api`. `/healthz` sits outside it. Request and response bodies are JSON.

## Request id

Every response carries an `x-request-id` header. A caller may send its own `x-request-id`; it is kept when it is 1 to 64 characters of letters, digits, `-`, `_` and `.` (a UUID, for example). Anything else, or no header, gets a new UUID. The same id is in every error body and on every server log line for that request, so a user can quote it and a developer can find the matching log lines.

## Errors

Every failure, from any endpoint, has this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid",
    "details": [{ "field": "priceCents", "reason": "must be at least 0" }],
    "requestId": "0b6c9f0e-6a4e-4a43-9d38-2f1b3c4d5e6f"
  }
}
```

- `code` is one of the codes in the table below, always upper snake case. Clients decide what to do from the status and the code, never from the message.
- `message` is a short sentence that can be shown to the user.
- `details` is present for validation errors and for `CONTACT_REQUIRED`: one entry per field, with the field's path (`address.city`) and a short reason. An unknown field is reported under its own name with the reason `is not an allowed field`.
- `matches` is present only for `POSSIBLE_DUPLICATE` (`POST /api/patients`): the existing patients the new one may duplicate. It sits beside `details`, which always holds field problems.
- `requestId` is the request id above.

The one exception is a request the HTTP layer cannot parse at all, such as headers over 16 KB or a body shorter than its `content-length`: Node and Fastify answer it with a plain 400 or 431 and no request id, before the app sees it.

### Status codes

| Status | Meaning | Example in this app |
|---|---|---|
| 400 | The input is malformed or has the wrong shape, including unknown extra fields, malformed JSON and a bad URL. | A lab test with a negative price, or a body with an `isAdmin` field. |
| 404 | The resource named in the URL path does not exist, or there is no such route. | `GET /api/patients/<id>` for an id that is not there. |
| 409 | The request conflicts with what is already stored. | Adding a lab test whose code already exists, or changing the status of an order someone else changed first. |
| 413 | The request body is larger than 1 MiB. | |
| 415 | The request body is not JSON. | A form-encoded or XML body. |
| 422 | The input has the right shape but breaks a business rule, or an id inside the body does not exist. | An order for a patient id that does not exist, or a status move that is not allowed. |
| 500 | Something unexpected broke on the server. The message is always "Something went wrong on our side"; the details are only in the server log, under the request id. | |
| 503 | The server is shutting down and did not run the request (requests already running finish first). | A request that arrives during a restart. |

### Error codes

Every code the API can return. The list is defined once, as `ERROR_CODES` in `src/server/errors.ts`; a unit test checks that this table lists exactly those codes. Each task that adds a code adds it to both.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | The input is malformed or has the wrong shape; `details` says which fields. |
| `NOT_FOUND` | 404 | No such route, or no such resource at this path. |
| `PAYLOAD_TOO_LARGE` | 413 | The request body is over 1 MiB. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | The request body is not JSON. |
| `INTERNAL_ERROR` | 500 | An unexpected failure on the server. |
| `SERVICE_UNAVAILABLE` | 503 | The server is shutting down; the request was not run. Try again. |
| `DUPLICATE_TEST_CODE` | 409 | A lab test with this code already exists (codes are compared after upper-casing). |
| `CONTACT_REQUIRED` | 422 | An edit would leave a patient with neither an email nor a phone; `details` names `email` and `phone`. |
| `POSSIBLE_DUPLICATE` | 409 | A new patient looks like existing ones; nothing was created, and `matches` lists them. Send again with `confirmDuplicate: true` to create anyway. |
| `INVALID_ORDER_TESTS` | 422 | An order's test list is empty, or lists a test twice, a test that does not exist or an inactive test; `details` names each offending id. |
| `UNKNOWN_PATIENT` | 422 | An order names a patient id that does not exist. |
| `ILLEGAL_TRANSITION` | 422 | The status transition table does not allow this move from the order's current status. |
| `ORDER_CHANGED` | 409 | Someone else changed the order between the server reading it and updating its status; nothing was overwritten. Reload the order. (A change that landed before the read gives 422 `ILLEGAL_TRANSITION` instead.) |

## Endpoints

### `GET /healthz`

Checks that the server is running and the database answers. It runs `select 1` and gives the database 2 seconds (to connect and answer), so a caller always gets a reply within 3 seconds, even when the database host is unreachable.

| Status | Body |
|---|---|
| 200 | `{ "status": "ok" }` |
| 503 | `{ "status": "unavailable" }` (the database did not answer in time; the server logs `health.db_unavailable` at `error`) |

It reports nothing else: no versions and no connection details.

### `GET /api/lab-tests`

Every lab test, active and inactive, sorted by code.

| Status | Body |
|---|---|
| 200 | An array of `{ "id": "<uuid>", "code": "CBC", "name": "Complete Blood Count", "priceCents": 2500, "turnaroundDays": 1, "isActive": true }` |

`priceCents` is whole cents; `turnaroundDays` is business days.

### `POST /api/lab-tests`

Adds a lab test. A new test is always active.

Body (all fields required, no others allowed):

| Field | Rule |
|---|---|
| `code` | Text, trimmed and upper-cased, then 2 to 20 letters, digits or hyphens (`demo-09` is stored as `DEMO-09`). |
| `name` | Text, trimmed, 1 to 100 characters, with no control characters (a NUL, tab or line break is a 400). |
| `priceCents` | Whole number of cents, 0 or more. |
| `turnaroundDays` | Whole number of business days, 1 to 365. |

| Status | Body |
|---|---|
| 201 | The new test, in the same shape as one item of `GET /api/lab-tests`. |
| 400 `VALIDATION_ERROR` | A field is missing, has the wrong type or breaks its rule, or there is an unknown field; `details` has one entry per field, for example `{ "field": "priceCents", "reason": "Must be a whole number of cents, 0 or more" }`. |
| 409 `DUPLICATE_TEST_CODE` | A test with this code already exists (`cbc` and `CBC` are the same code). Message: "This code already exists". No row is added. |

Logged: `lab_test.created` at `info` with `labTestId`; `lab_test.duplicate_code` at `warn`, without the code.

### `PATCH /api/lab-tests/:id`

Changes some of a test's fields and leaves the others as they are. `:id` is the test's uuid.

Body: at least one of these fields, no others allowed. Each has the same rule as in `POST /api/lab-tests`, from the same schema pieces.

| Field | Rule |
|---|---|
| `name` | Text, trimmed, 1 to 100 characters, with no control characters (a NUL, tab or line break is a 400). |
| `priceCents` | Whole number of cents, 0 or more. |
| `turnaroundDays` | Whole number of business days, 1 to 365. |
| `isActive` | `true` or `false`. `false` deactivates the test: it stays in the list and in old orders, but is not offered on new ones (LAB-12). |

`code` is not accepted: a test's code never changes. A body with `code` is refused with a detail on `code`, not silently ignored.

| Status | Body |
|---|---|
| 200 | The updated test, in the same shape as one item of `GET /api/lab-tests`. |
| 400 `VALIDATION_ERROR` | The id is not a uuid (detail on `id`); the body is empty `{}` (detail on `(input)`: "Send at least one of name, priceCents, turnaroundDays, isActive"); a field breaks its rule; or there is `code` or another unknown field (`{ "field": "code", "reason": "is not an allowed field" }`). Nothing is changed. |
| 404 `NOT_FOUND` | No test has this id. Message: "There is no lab test with this id". |

The update is one SQL statement, so it is atomic and sets `updated_at` itself. Editing a price or turnaround changes only orders placed afterwards: order items keep their own copy (LAB-12). When two people save the same test, the last save wins (see `docs/plan/backlog.md`).

Logged: `lab_test.updated` at `info` with `labTestId` and `fieldCount` (how many fields were sent), and `active: "activated"` or `"deactivated"` when the active flag changed; never a value or a field name. A refused update is the standard `request.rejected` line at `warn`.

### No `DELETE`

Lab tests are never deleted, only deactivated, because orders point at them. `DELETE /api/lab-tests/:id` is not a route, so it gets the standard 404 `NOT_FOUND` ("There is nothing at this address") and removes nothing.

### `POST /api/patients`

Adds a patient. Body (unknown fields are a 400):

```json
{ "firstName": "Test", "lastName": "Patient", "dateOfBirth": "1984-03-09", "email": "test.patient@example.test", "phone": "(801) 555-0100" }
```

The body may also carry `"confirmDuplicate": true` (see the duplicate check below).

| Field | Rule |
|---|---|
| `firstName`, `lastName` | Required. Trimmed, then 1 to 100 characters, with no control characters (a NUL, tab or line break). |
| `dateOfBirth` | Required. `YYYY-MM-DD`, a real calendar date (`2020-02-29` yes, `2020-02-30` and `1984-13-01` no), and not after today in the clinic's time zone (`CLINIC_TIMEZONE`, by the server's clock). |
| `email` | Optional. Empty text or `null` counts as absent. Trimmed and lower-cased, then it must look like an email address (at most 254 characters). |
| `phone` | Optional. Empty text or `null` counts as absent. It may contain only digits, spaces, dashes, dots, parentheses and a leading `+`; a letter is refused, not dropped (`801 555 01OO` is a typo). The formatting is removed, and what remains must be a US number with its area code: 10 digits, or 11 starting with 1, whose 1 is dropped. `(801) 555-0100`, `801.555.0100` and `+1 801 555 0100` are all stored as `8015550100`; `555-0100` (no area code) is refused with "must be a 10-digit number, including the area code". International numbers are not supported. The API returns the 10 digits; the screen formats them. |
| `email` or `phone` | At least one of the two must be present. If neither is, `details` names both, `email` and `phone`. |
| `confirmDuplicate` | Optional. `true` or `false` (anything else, `"yes"` for example, is a 400 "must be true or false"). `true` skips the duplicate check. Never stored. |

The rules are one schema, `createPatientBody` in `src/shared/patients.ts`, which the New patient form also uses. The body is checked first: an invalid body is a 400 even when it would also match an existing patient.

**Duplicate check (LAB-10).** Unless `confirmDuplicate` is `true`, the server looks for existing patients the new one may duplicate. An existing patient matches if any one of these holds:

| Rule (as logged) | Matches when |
|---|---|
| `email` | The same email, compared trimmed and lower-cased (`TEST.Person@Example.test` is `test.person@example.test`). Only when the new patient has an email: a missing email never matches a missing email. |
| `phone` | The same phone, compared as the stored 10 digits (`(801) 555-0100` is `8015550100`). Only when the new patient has a phone. |
| `name_dob` | The same first name, last name and date of birth. Names are compared trimmed and ignoring letter case (` test ` is `TEST`); the date exactly. |

Every comparison is exact: `Jon` is not `John`, `Zoe` is not `Zoë`, and a last name alone, or a name with another date of birth, is never a match. Ignoring letter case relies on Postgres `lower()` to find candidates and JavaScript `toLowerCase()` to decide; for a few non-English letters (Greek final sigma, Turkish dotted I) the two differ, so such names may not match. The check warns and never blocks, because two real people can share a name and birthday or a household phone. It is not locked together with the insert, so two identical requests at the same moment can both create a patient; that is accepted for this version. Editing a patient (`PATCH`) runs no duplicate check.

| Status | Body |
|---|---|
| 201 | The patient: `{ "id", "firstName", "lastName", "dateOfBirth", "email", "phone" }`, with the stored (normalized) values; an absent `email` or `phone` is `null`. |
| 400 | `VALIDATION_ERROR`, one `details` entry per failed field, for example `{ "field": "dateOfBirth", "reason": "cannot be in the future" }`. |
| 409 | `POSSIBLE_DUPLICATE`: nothing was created. Message: "This patient may already exist. Open the existing patient, or create a new one anyway." `error.matches` lists the matching patients, at most 10, sorted by last name, then first name, each `{ "id", "firstName", "lastName", "dateOfBirth", "email", "phone" }` and nothing else. Sending the same body with `"confirmDuplicate": true` creates the patient (201). |

There is no login in this version, so the matches go to any caller of the API. With logins, returning another patient's details here would need a permission check (`docs/plan/backlog.md`).

Logged: `patient.created` at `info` with the `patientId`, plus `duplicateConfirmed: true` when the request carried `confirmDuplicate: true`. On a 409, `patient.possible_duplicate` at `warn` with `code`, `matchCount` and `rules` (the rule names that matched, from `email`, `phone`, `name_dob`), then `patient.possible_duplicate.matches` at `debug` with each matched `patientId` and its rules. Never a name, date of birth, email or phone.

### `GET /api/patients`

Every patient, or the patients whose name matches `q`, as an array of the same shape as the 201 above, sorted by last name, then first name (ignoring case), then id.

| Query parameter | Rule |
|---|---|
| `q` | Optional search text. Trimmed; missing, empty or blank returns every patient. At most 100 characters after trimming and no control characters, or 400 `VALIDATION_ERROR` on `q`. Sent twice (`?q=a&q=b`) is a 400. |
| anything else | An unknown parameter is a 400. |

How `q` matches:

- **What:** the name only, as "first last" (`first_name || ' ' || last_name`), never the date of birth, email or phone. A first name or a last name alone is part of "first last", so `jane`, `smith` and `jane sm` all find Jane Smith. Last name first (`smith jane`) does not.
- **How:** case-insensitive, anywhere in the name (`ILIKE '%' || q || '%'`): `Sm`, `SMITH` and `mit` all find Jane Smith.
- **Literal text:** `%`, `_` and `\` in `q` match only themselves (each is escaped with a backslash, `escape '\'`), and `q` is always a bound parameter, never part of the SQL. `%` alone finds only names that contain a `%`.
- **How many:** at most 50 patients (`SEARCH_RESULT_LIMIT`), in the order above; there is no paging. The Patients page says "Showing the first 50 matches" when a search returns 50, so the user types more of the name. Without `q` the list is not capped.
- **Speed:** no index. A leading `%` cannot use a b-tree index, and scanning a clinic's patient table is quick at this size; a trigram index is the next step if it grows.

The search text is never logged. The server logs `patient.search` at `debug` with `hasQuery` and `resultCount` only, and the request line has the route pattern (`/api/patients`), not the URL with its query string.

### `GET /api/patients/:id`

One patient, in the same shape.

| Status | Body |
|---|---|
| 200 | The patient. |
| 400 | `VALIDATION_ERROR` on `id`: the id is not a uuid. |
| 404 | `NOT_FOUND`: no patient has this id. |

### `PATCH /api/patients/:id`

Changes some of a patient's details. The body has any of the create fields, at least one, and nothing else:

```json
{ "phone": "(801) 555-0102", "email": null }
```

| Field | Rule |
|---|---|
| a field left out | Unchanged. |
| `firstName`, `lastName`, `dateOfBirth` | The same rules as on create (one shared definition, `patientFields`), including "not after the clinic's today". `null` is a 400. |
| `email`, `phone` | The same rules and normalization as on create. `null` or empty text removes the value. |

`updated_at` is set on every successful edit. The update is one `UPDATE ... RETURNING`, with no read first.

| Status | Body |
|---|---|
| 200 | The whole patient, with the stored values. |
| 400 | `VALIDATION_ERROR`: the id is not a uuid, a field breaks its rule, there is an unknown field, or the body is `{}` (`details` has `{ "field": "(input)", "reason": "must include at least one field to change" }`). |
| 404 | `NOT_FOUND`: no patient has this id. |
| 422 | `CONTACT_REQUIRED`: after the change the patient would have neither an email nor a phone, with `details` on `email` and `phone` (the same reasons as on create). Nothing is changed. |

**400 or 422.** A 400 means the request is wrong on its own. On create, a body without email and phone is a 400, because the body is the whole patient. On edit, `{ "email": null }` is well formed and is wrong only together with what is stored (a patient with no phone), so it is a 422. The database decides it: the `patients_contact_required` check refuses the updated row and the server turns that violation into the 422, so there is no gap between a read and a write in which another request could change the row. Sending `email` and `phone` both as `null` is a 422 too: there is one rule for edits, and the database enforces it.

Two people saving the same patient at once: the last save wins (a future version may add a version check).

An edit runs no duplicate check (LAB-10): changing a patient's email to another patient's email is saved with no warning. `confirmDuplicate` is not an edit field, so sending it is a 400 like any unknown field.

The server logs `patient.updated` at `info` with `patientId` and `changedFields` (the names of the fields the request set, never their values). Rejections are logged at `warn` by the error handler, with the code and a count of fields.

### `GET /api/orders`

Orders, newest first (`created_at` descending, then `id` descending, so orders placed at the same moment always come back in the same order, and every page is the same on every call), one page at a time, optionally narrowed by status and patient.

| Query parameter | Rule |
|---|---|
| `status` | One of `ordered`, `collected`, `completed`, `cancelled` (`ORDER_STATUSES`). Optional. |
| `patientId` | A uuid. Optional. A well-formed id that no patient has is not an error: the list is simply empty (it is a filter, not a resource in the path). |
| `limit` | A whole number from 1 to 100. Default 25. |
| `offset` | A whole number, 0 or more. Default 0. |

The filters combine with AND. No other parameter is allowed.

Paging: the server asks the database for `limit + 1` rows. Getting the extra row means there is a next page: `hasMore` is `true` and the extra row is dropped. There is no count of all the matching orders (a `COUNT` would read every matching row on every request), so a screen cannot say "page 3 of 12"; it asks for the next page with `offset` = the number of rows it already has. Offset paging is not stable against new orders: see `docs/architecture.md`, "Scaling the orders list".

```json
{
  "items": [
    {
      "id": "5eed0011-0000-4000-8000-000000000003",
      "status": "ordered",
      "patient": {
        "id": "5eed0008-0000-4000-8000-000000000002",
        "firstName": "Sample",
        "lastName": "Person",
        "dateOfBirth": "1990-12-31"
      },
      "testCount": 2,
      "totalCents": 5600,
      "estimatedReadyDate": "2026-11-03",
      "createdAt": "2026-10-30T18:00:00.000Z",
      "createdAtClinic": "2026-10-30 12:00"
    }
  ],
  "hasMore": false,
  "clinicTimezone": "America/Denver"
}
```

| Field | Meaning |
|---|---|
| `items` | The orders. An object with `items` rather than a bare array, so `hasMore` and `clinicTimezone` sit beside them. |
| `status` | One of `ordered`, `collected`, `completed`, `cancelled` (`ORDER_STATUSES`). |
| `patient` | The patient's id, names and date of birth (`YYYY-MM-DD`): what the screen needs to name them. No email or phone. |
| `testCount` | How many items the order has. |
| `totalCents` | The sum of the items' `price_cents` as they were when the order was placed, in whole cents. Worked out on every request by `calculateTotal`; never stored. |
| `estimatedReadyDate` | `YYYY-MM-DD`, stored when the order was placed. |
| `createdAt` | When the order was placed, an ISO 8601 instant in UTC. |
| `createdAtClinic` | The same moment on the clinic's wall clock, `YYYY-MM-DD HH:mm` (24-hour) in `CLINIC_TIMEZONE`. Screens show this, so every browser shows the clinic's time whatever its own time zone. |
| `hasMore` | `true` when more orders match after this page; see paging above. |
| `clinicTimezone` | The IANA name of `CLINIC_TIMEZONE`, for labelling the created time ("Created (America/Denver)"). |

| Status | Body |
|---|---|
| 200 | The list above (`{ "items": [], ... }` when there are no orders). |
| 400 | `VALIDATION_ERROR` for a `status` that is not one of the statuses, a `patientId` that is not a uuid, a `limit` or `offset` that is out of range or not a whole number (`1.5`, `abc`, empty), a parameter given twice, or an unknown parameter. `details` names each field. |

Logged: the request line, and `debug` `orders.listed` with `filters` (the names of the filters that were present, such as `["status"]`, never their values), `rowCount` and `hasMore`. Nothing about the patients is logged.

### `GET /api/orders/:id`

One order with its patient and the tests it holds (LAB-15). Read-only.

```json
{
  "id": "5eed0011-0000-4000-8000-000000000003",
  "status": "collected",
  "patient": {
    "id": "5eed0008-0000-4000-8000-000000000002",
    "firstName": "Sample",
    "lastName": "Person",
    "dateOfBirth": "1990-12-31",
    "email": "sample@example.test",
    "phone": null
  },
  "items": [
    {
      "labTestId": "5eed0003-0000-4000-8000-000000000001",
      "testCode": "CBC",
      "testName": "Complete Blood Count",
      "priceCents": 2500,
      "turnaroundDays": 1
    }
  ],
  "totalCents": 2500,
  "estimatedReadyDate": "2026-11-03",
  "createdAt": "2026-10-30T18:00:00.000Z",
  "createdAtClinic": "2026-10-30 12:00",
  "clinicTimezone": "America/Denver",
  "allowedNextStatuses": ["completed"],
  "canCancel": true,
  "cancellation": null
}
```

| Field | Meaning |
|---|---|
| `patient` | The patient's id, names, date of birth (`YYYY-MM-DD`), and email and phone (each `null` when not given). |
| `items` | The order's tests, read from the `order_items` columns (code, name, price and turnaround as they were when the order was placed), never from the catalog. Each item has the shape in `src/shared/order-items.ts`, the one definition LAB-12 and LAB-13 reuse. Sorted by code. |
| `totalCents` | The sum of the items' `priceCents`, worked out by `calculateTotal`; never stored. |
| `createdAtClinic`, `clinicTimezone` | As in the list: the clinic's wall clock and the zone it is in, for the label "Created (America/Denver)". |
| `allowedNextStatuses` | The forward moves the status transition table allows from the current status: `["collected"]` for `ordered`, `["completed"]` for `collected`, `[]` for `completed` and `cancelled`. |
| `canCancel` | `true` when the table allows `cancelled` from the current status (`ordered` and `collected`). |
| `cancellation` | `null` unless the order is cancelled (LAB-17). Then `{ "note", "cancelledBy", "cancelledAt", "cancelledAtClinic" }`: why, who (typed in; there is no login), the moment as ISO 8601 in UTC, and the same moment on the clinic's clock (`YYYY-MM-DD HH:mm` in `clinicTimezone`), as `createdAtClinic` is. |

| Status | Body |
|---|---|
| 200 | The order above. |
| 400 | `VALIDATION_ERROR`: `:id` is not a uuid. |
| 404 | `NOT_FOUND`: no order has that id. |

Logged: `debug` `order.loaded` with the order id and item count; `warn` `order.not_found` with the order id. Nothing about the patient.

### `POST /api/orders/quote`

What an order of these tests would cost and when it would be ready, if it were placed now (LAB-13). It saves nothing and takes no patient. The New order modal calls it each time the chosen tests change.

```json
{ "labTestIds": ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000008"] }
```

Same rules for `labTestIds` as `POST /api/orders` (the same function checks them), and no other field is allowed. The response:

```json
{
  "items": [
    { "labTestId": "10000000-0000-4000-8000-000000000001", "testCode": "CBC", "testName": "Complete Blood Count", "priceCents": 2500, "turnaroundDays": 1 },
    { "labTestId": "10000000-0000-4000-8000-000000000008", "testCode": "CULT", "testName": "Bacterial Culture", "priceCents": 5250, "turnaroundDays": 5 }
  ],
  "totalCents": 7750,
  "estimatedReadyDate": "2026-11-20"
}
```

`totalCents` comes from `calculateTotal` and `estimatedReadyDate` from `estimateReadyDate`, with the injected clock read once and `CLINIC_TIMEZONE`: the same values the order would have if placed at that moment.

| Status | Body |
|---|---|
| 200 | The quote above. Nothing is written. |
| 400 | `VALIDATION_ERROR`: `labTestIds` missing or not a list of uuids, or an unknown extra field. |
| 422 | `INVALID_ORDER_TESTS`: the list is empty, or a test is repeated, does not exist or is inactive; `details` names each offending position, as for create. |

Logging: only the `order.ready_date_estimated` line at `debug` (ids and counts); a refusal is `warn` from the error handler. The quote adds no `info` line of its own (only the generic `request.completed` line every request gets).

### `POST /api/orders`

Places an order: one patient and the tests to run.

```json
{
  "patientId": "5eed0008-0000-4000-8000-000000000002",
  "labTestIds": [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000003"
  ]
}
```

| Field | Rule |
|---|---|
| `patientId` | A uuid. Required. |
| `labTestIds` | A list of uuids. Required. The list must not be empty, and each test must exist, be active and appear once (otherwise a 422, below). |

Ids may be sent in upper or lower case; they are compared in lower case. No other field is allowed.

**The `Idempotency-Key` header (LAB-18), optional.** A uuid made by the browser for one attempt to place an order (the New order modal makes one each time it opens, and sends it again on a retry). The first request with a key places the order and stores the key on it (201). Any later request with the same key, whatever its body, places nothing and answers 200 with the order that key placed, in the same shape, as it is stored now. The body is not compared with the first one: a different patient or different tests under a used key still get the first order (a known limit, `docs/plan/backlog.md`). Two requests with the same key at the same moment place one order: one gets 201, the other 200 with that order, never a 409 or a 500. A key is compared in lower case. An empty header counts as no key; any other value that is not a uuid is a 400. Without the header nothing changes: every request places an order.

```
Idempotency-Key: 9b2f6c1e-3d4a-4f5b-8c7d-0e1f2a3b4c5d
```

What the server does, in one database transaction (all or nothing):

1. Reads the clock once. That instant is the order's `createdAt` and the moment its ready date counts from.
2. Reads the chosen tests from the catalog, locked until the transaction ends, and checks the whole list: every offending id is reported, not only the first. The catalog is the authority: a test deactivated after the browser loaded its list is refused.
3. Works out `estimatedReadyDate` with `estimateReadyDate` (the Nth business day after the order day in `CLINIC_TIMEZONE`, N the longest turnaround) and stores it.
4. Inserts the order with status `ordered`, then one item per test, each a copy of the test's code, name, price and turnaround at that moment. A later catalog change never alters the order. With a key that an order already holds, the order insert does nothing (`on conflict (idempotency_key) do nothing`); no item is inserted and the stored order is returned instead.

The total is not stored; the response works it out from the items with `calculateTotal`, as `GET /api/orders` does.

| Status | Body |
|---|---|
| 201 | The new order, in the same shape as one row of `GET /api/orders` (`status` is `ordered`). |
| 200 | A replay: the `Idempotency-Key` was used before. The order that key placed, in the same shape. Nothing is saved. |
| 400 | `VALIDATION_ERROR`: a missing field, an id that is not a uuid, `labTestIds` that is not a list, or an unknown extra field; or an `Idempotency-Key` that is not a uuid (`{ "field": "idempotency-key", "reason": "Must be a uuid" }`). Nothing is saved. |
| 422 | `INVALID_ORDER_TESTS`: the list is empty, or a test is repeated, does not exist or is inactive. `details` has one entry per offending position, for example `{ "field": "labTestIds.1", "reason": "Lab test <id> is inactive" }` (`{ "field": "labTestIds", ... }` for an empty list). Nothing is saved. |
| 422 | `UNKNOWN_PATIENT`: no patient has this id. A 422, not a 404: the URL (`/api/orders`) exists; it is an id inside the body that does not. Nothing is saved. |

When both the tests and the patient are wrong, the tests are reported: they are checked first, and the patient is checked by the order insert's foreign key. The tests are checked before the key too, so a replay whose tests are now refused (one was deactivated since, say) gets the 422, not the earlier order. A refused attempt stores nothing, so its key stays unused and a retry with it can still place the order.

The server logs `order.created` at `info` with `orderId`, `patientId` and `itemCount` (not on a replay, which created nothing: that is `order.create_replayed` at `warn`, with `orderId` and `idempotencyKey`, a random id that is not patient data), and `order.ready_date_estimated` at `debug` with `itemCount`, `longestTurnaroundDays` and `estimatedReadyDate`. A refusal is logged at `warn` by the error handler, with the code and a count of `details`. No name, date of birth or test name is logged.

An order's tests and patient cannot be edited after it is placed (a future version may allow it); only its status moves, with the endpoints below. Sending the same request twice without an `Idempotency-Key` places two orders.

### `POST /api/orders/:id/transitions`

Moves an order one step forward (LAB-16): `ordered` to `collected`, `collected` to `completed`.

```json
{ "to": "collected" }
```

| Field | Rule |
|---|---|
| `to` | `collected` or `completed`. Required. Any other value is a 400, `cancelled` included: cancelling has its own endpoint (LAB-17), and `ordered` is where every order starts. No other field is allowed. |

What the server does, in this order, so each failure has its own answer:

1. Reads the order. None: 404.
2. Checks the move with `assertTransition` (the transition table, `src/server/orders/domain/transitions.ts`) against the status just read. Not allowed: 422, and nothing is written.
3. Updates with a condition on the status it read: `update orders set status = <to>, updated_at = now() where id = <id> and status = <status read>`. If that changes no row, someone else changed the order after step 1 (two people pressed the button at once): 409, and nothing is overwritten. A change that landed before step 1 (a second tab left open on the old status) is not a 409: step 2 judges the move from the status read now, so it is a 422. This is an accepted limitation of this version (`docs/plan/backlog.md`).

Only `status` and `updated_at` change; the stored ready date stays as it is.

| Status | Body | What the user does |
|---|---|---|
| 200 | The order in its new status, in the same shape as `GET /api/orders/:id` (with its new `allowedNextStatuses` and `canCancel`). | |
| 400 | `VALIDATION_ERROR`: `:id` is not a uuid; `to` is missing, not a string or not `collected` or `completed`; or an unknown extra field. | Nothing; the screen never sends these. |
| 404 | `NOT_FOUND`: no order has that id. | The order is not there. |
| 409 | `ORDER_CHANGED`: "This order was changed by someone else". Only when the other change landed between this request's read and its update. | Reload the order and look at its real status. |
| 422 | `ILLEGAL_TRANSITION`: the table does not allow the move from the status the server read, for example "An order cannot move from ordered to completed", or any move from `completed` or `cancelled`. | The rules forbid it; trying again will not help. A screen that offered the move from an older status gets this too (the order moved since it loaded) and reloads the order. |

Logged: `info` `order.status_changed` with `orderId`, `from` and `to`; `warn` `order.transition_refused` with `code`, `orderId`, `from` and `to` for an illegal move; `warn` `order.transition_lost_race` with `code`, `orderId`, `expected` (the status read) and `to` for a lost race. Nothing about the patient.

### `POST /api/orders/:id/cancel`

Cancels an order that is `ordered` or `collected` (LAB-17), keeping why and who. The order is never deleted and its items stay as they were. Cancelling is its own endpoint, not a `to` value of the transitions endpoint, because it carries data the other moves do not.

```json
{ "note": "Patient asked to reschedule", "cancelledBy": "Sample Staff" }
```

| Field | Rule |
|---|---|
| `note` | Why the order is cancelled. Required text, trimmed, then 1 to 500 characters. Line breaks and tabs are kept; other control characters (NUL included) are refused. |
| `cancelledBy` | The name of the person cancelling, typed in (there is no login; with one it would come from the signed-in user). Required text, trimmed, then 1 to 100 characters, no control characters. |

No other field is allowed.

The same steps as a transition, in the same order:

1. Reads the order. None: 404.
2. Checks the move to `cancelled` with `assertTransition`, the same transition table, against the status just read. From `completed` or `cancelled`: 422, and nothing is written.
3. Updates with a condition on the status it read, setting everything at once: `update orders set status = 'cancelled', cancellation_note = <note>, cancelled_by = <name>, cancelled_at = now(), updated_at = now() where id = <id> and status = <status read>`. No row changed: someone else changed the order after step 1, 409, and nothing is overwritten. As with transitions, a change that landed before step 1 is judged by step 2 (a 422).

| Status | Body | What the user does |
|---|---|---|
| 200 | The cancelled order, in the same shape as `GET /api/orders/:id`, with `status: "cancelled"`, `allowedNextStatuses: []`, `canCancel: false` and its `cancellation`. | |
| 400 | `VALIDATION_ERROR`: `:id` is not a uuid; `note` or `cancelledBy` is missing, not text, blank, or over its limit; or an unknown extra field. `details` names each field. | Fix the field; the panel checks the same rules before sending. |
| 404 | `NOT_FOUND`: no order has that id. | The order is not there. |
| 409 | `ORDER_CHANGED`: "This order was changed by someone else". | Reload the order and look at its real status. |
| 422 | `ILLEGAL_TRANSITION`: "An order cannot move from completed to cancelled" (or from `cancelled`). | The order cannot be cancelled. The panel reloads it. |

Logged: `info` `order.cancelled` with `orderId` and `from`; `warn` `order.cancel_refused` with `code`, `orderId`, `from` and `to`; `warn` `order.cancel_lost_race` with `code`, `orderId`, `expected` and `to`. Never the note or the name: both are free text typed by staff and can hold anything about the patient.
