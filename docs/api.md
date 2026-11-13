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
- `requestId` is the request id above.

The one exception is a request the HTTP layer cannot parse at all, such as headers over 16 KB or a body shorter than its `content-length`: Node and Fastify answer it with a plain 400 or 431 and no request id, before the app sees it.

### Status codes

| Status | Meaning | Example in this app |
|---|---|---|
| 400 | The input is malformed or has the wrong shape, including unknown extra fields, malformed JSON and a bad URL. | A lab test with a negative price, or a body with an `isAdmin` field. |
| 404 | The resource named in the URL path does not exist, or there is no such route. | `GET /api/patients/<id>` for an id that is not there. |
| 409 | The request conflicts with what is already stored. | Adding a lab test whose code already exists. |
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

| Field | Rule |
|---|---|
| `firstName`, `lastName` | Required. Trimmed, then 1 to 100 characters, with no control characters (a NUL, tab or line break). |
| `dateOfBirth` | Required. `YYYY-MM-DD`, a real calendar date (`2020-02-29` yes, `2020-02-30` and `1984-13-01` no), and not after today in the clinic's time zone (`CLINIC_TIMEZONE`, by the server's clock). |
| `email` | Optional. Empty text or `null` counts as absent. Trimmed and lower-cased, then it must look like an email address (at most 254 characters). |
| `phone` | Optional. Empty text or `null` counts as absent. It may contain only digits, spaces, dashes, dots, parentheses and a leading `+`; a letter is refused, not dropped (`801 555 01OO` is a typo). The formatting is removed, and what remains must be a US number with its area code: 10 digits, or 11 starting with 1, whose 1 is dropped. `(801) 555-0100`, `801.555.0100` and `+1 801 555 0100` are all stored as `8015550100`; `555-0100` (no area code) is refused with "must be a 10-digit number, including the area code". International numbers are not supported. The API returns the 10 digits; the screen formats them. |
| `email` or `phone` | At least one of the two must be present. If neither is, `details` names both, `email` and `phone`. |

The rules are one schema, `createPatientBody` in `src/shared/patients.ts`, which the New patient form also uses. There is no duplicate check (LAB-10): two identical bodies create two patients.

| Status | Body |
|---|---|
| 201 | The patient: `{ "id", "firstName", "lastName", "dateOfBirth", "email", "phone" }`, with the stored (normalized) values; an absent `email` or `phone` is `null`. |
| 400 | `VALIDATION_ERROR`, one `details` entry per failed field, for example `{ "field": "dateOfBirth", "reason": "cannot be in the future" }`. |

The server logs `patient.created` with the `patientId` only.

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

The server logs `patient.updated` at `info` with `patientId` and `changedFields` (the names of the fields the request set, never their values). Rejections are logged at `warn` by the error handler, with the code and a count of fields.
