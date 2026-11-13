# API

Every endpoint the server offers, with its request and response bodies, status codes and error codes.

Feature endpoints live under `/api` (the first ones arrive with LAB-06). `/healthz` sits outside it. Request and response bodies are JSON.

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
- `details` is only present for validation errors: one entry per field, with the field's path (`address.city`) and a short reason. An unknown field is reported under its own name with the reason `is not an allowed field`.
- `requestId` is the request id above.

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

### Error codes

Every code the API can return. The list is defined once, as `ERROR_CODES` in `src/server/errors.ts`; a unit test checks that this table lists exactly those codes. Each task that adds a code adds it to both.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | The input is malformed or has the wrong shape; `details` says which fields. |
| `NOT_FOUND` | 404 | No such route, or no such resource at this path. |
| `PAYLOAD_TOO_LARGE` | 413 | The request body is over 1 MiB. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | The request body is not JSON. |
| `INTERNAL_ERROR` | 500 | An unexpected failure on the server. |

## Endpoints

### `GET /healthz`

Checks that the server is running and the database answers. It runs `select 1` and gives the database 2 seconds (to connect and answer), so a caller always gets a reply within 3 seconds, even when the database host is unreachable.

| Status | Body |
|---|---|
| 200 | `{ "status": "ok" }` |
| 503 | `{ "status": "unavailable" }` (the database did not answer in time; the server logs `health.db_unavailable` at `error`) |

It reports nothing else: no versions and no connection details.
