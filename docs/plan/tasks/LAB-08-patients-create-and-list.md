# LAB-08: Patients: add and list patients

- **Status:** Not started
- **Type:** Vertical slice
- **Depends on:** LAB-05 (Checks on every pull request)
- **Unblocks:** LAB-09 (Patients: search by name and edit a patient), LAB-11 (Orders: see orders on the home page)
- **Branch:** `lab-08-patients-create-and-list`

## Description

After this task, a user can open the Patients page, see a table of patients, click New patient, fill in a form with clear field errors, and see the new patient in the list.

Patients come before orders because every order belongs to a patient. This slice sets the patient rules once, in the database and in one shared schema: required fields, at least one way to contact the patient, phone stored as digits, email stored lower case, and a date of birth that is a real calendar date, not in the future, kept as a `YYYY-MM-DD` string from form to database and back. There is deliberately no duplicate check yet (LAB-10).

## Requirements

**Data**
- New plain SQL migration creating `patients`: `id uuid` primary key, `first_name text not null`, `last_name text not null`, `date_of_birth date not null`, `email text null`, `phone text null`, `created_at` and `updated_at` (`timestamptz`, default now).
- Database checks: first and last name not blank; `email is not null or phone is not null`; `phone ~ '^[0-9]+$'` when present; `email = lower(email)` when present; `date_of_birth <= current_date + 1`. The last one is only a loose backstop: the database runs in UTC, which can be a day ahead of or behind the clinic, so the precise rule is enforced in code with the clinic timezone and the database check must never reject a date the code accepts. The real "not in the future" check is in the schema (below).
- The pg date parser was configured in LAB-02 and is not touched here; this task only tests that date of birth round-trips as a string.
- Seed (added to `pnpm db:seed`): exactly 6 obviously fake patients (for example "Test Patient", "Sample Person"; email domain `example.test`; phones such as `5550100`). Every seeded row has a fixed UUID and is inserted with `on conflict (id) do nothing`, so running the seed twice leaves the same rows. Never run by unit or integration tests (the e2e setup in LAB-21 loads the seed into lab_orders_e2e).

**API**
- `POST /api/patients` body `{ firstName, lastName, dateOfBirth, email?, phone? }` returns 201 with `{ id, firstName, lastName, dateOfBirth, email, phone }`.
- `GET /api/patients` returns 200 with an array of the same shape, sorted by last name, then first name.
- Rules live in one strict Zod schema in `src/shared/`: names trimmed, 1 to 100 characters; `dateOfBirth` matches `YYYY-MM-DD`, is a real calendar date (`2020-02-30` rejected, `2020-02-29` accepted) and not after today, using pure `isRealDate` and a `today(timezone, now)` helper, where `now` is a `Date`, that returns the `YYYY-MM-DD` string of `now` in that timezone. The server calls `today(CLINIC_TIMEZONE, clock())` (the same setting the ready date uses, LAB-11, and the injected clock from LAB-03); the browser calls it with the browser's timezone and `new Date()`, as an advisory check only (it gives early feedback and the server decides); empty email or phone counts as absent; email must look like an email and is lower-cased; phone has non-digits stripped and must keep at least one digit; at least one of email or phone must be present.
- Any failure returns 400 `VALIDATION_ERROR` with `details` per field, naming both `email` and `phone` for the "at least one" rule. Unknown extra fields return 400.
- Code goes in `src/server/patients/{routes.ts,repo.ts}`; the route parses explicitly and calls the repo directly.

**UI**
- `src/web/patients/`: Patients page at `/patients` with a table (Name, Date of birth, Email, Phone), a New patient button, an empty state, and loading and error states that show the request id.
- New patient form at `/patients/new`, built as a reusable `PatientForm` component (LAB-09 reuses it for edit). Errors appear under the field and clear on edit; the contact error appears under both email and phone. Submit is disabled while saving. On success, go to `/patients`.
- Reusable `PatientLabel` component shows the name with date of birth ("Name (born Mar 9, 1984)"), used on list rows here and on later screens. A pure `formatDate` splits the `YYYY-MM-DD` string; it never builds a `Date`.
- Server 400 details map to the same field slots as the client checks.

**Logging**
- `info` `patient.created` with `patientId`. `warn` for rejected input with the failed field names only, never values. Request bodies are never logged.

## Acceptance criteria

- [ ] After `pnpm db:seed`, the Patients page lists exactly 6 patients sorted by last name; with no rows the empty state shows.
- [ ] Creating a patient with all fields adds them to the list, and the date of birth shown is exactly the date typed.
- [ ] Leaving out first name, last name or date of birth shows an error under that field.
- [ ] Supplying neither email nor phone shows an error under both; supplying only one is accepted.
- [ ] `2020-02-30`, `1984-13-01`, tomorrow's date and `31/12/1990` are rejected with an error on date of birth; today's date and `2020-02-29` are accepted.
- [ ] A phone typed as `(801) 555-0100` is stored as `8015550100`; an email typed as `Jane@Example.test` is stored as `jane@example.test`.
- [ ] A phone of `abc` is rejected.
- [ ] The same invalid bodies sent directly to `POST /api/patients` return 400 `VALIDATION_ERROR` with field details and a request id.
- [ ] The database rejects a row with neither email nor phone, and a row whose phone contains letters (direct SQL).
- [ ] Two patients with identical details can both be created (no duplicate check yet).
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.
- [ ] With the injected clock set just before midnight in the clinic timezone (already the next day in UTC), the clinic's today is accepted and the clinic's tomorrow is rejected.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 1).

## Tests

- **Unit:** `isRealDate` (leap years, month and day limits); future-date check with an injected today; `today(timezone, now)` called with a `Date` that is already tomorrow in UTC but still today in the clinic timezone; phone digit stripping; email lower-casing; the "at least one contact" rule; `formatDate` (`1984-03-09` gives "Mar 9, 1984", same under a different process timezone).
- **Integration:** create returns 201 with normalized stored values; each validation failure returns 400 on the right fields; list order; check constraints reject bad rows; date of birth round-trips as the same string under `TZ=America/Los_Angeles`; one test with the injected clock set just before midnight clinic time (clinic today accepted, clinic tomorrow rejected, the server using `CLINIC_TIMEZONE`); seed twice gives the same 6 rows.
- **Component:** `PatientForm` shows field errors, and `PatientLabel` renders name and date of birth.
- **E2E:** none here; journeys are LAB-21.

## Docs to update

- `docs/data-model.md`: `patients` table, constraints, why date of birth is a date and phone and email are normalized; the date-of-birth database check is `date_of_birth <= current_date + 1` because the database runs in UTC (a day ahead of or behind the clinic) and it is only a loose backstop that must never reject a date the code accepts; the schema check uses the clinic timezone.
- `docs/api.md`: the two endpoints, field rules, the error details shape.
- `docs/data-flow.md`: a date of birth as a string, end to end.
- `docs/acceptance-checklist.md`: patients create and list checks (Checkpoint 1).
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry; note any limitation or assumption noticed here.
- `AGENTS.md`: dates are `YYYY-MM-DD` strings, never `Date`; patient rules live in the shared schema; reuse `PatientForm` and `PatientLabel`.
- `docs/plan/`: set this task's status.

## Out of scope

- Search and edit: LAB-09. Duplicate warning: LAB-10.
- The patient's order history: LAB-19.
- Deleting a patient: future version (retention rules need the product owner).
- International phone formats and email verification: future version.

## What to be able to explain

1. Why is date of birth a `date` and a string, and what bug does a `Date` object cause in US timezones?
2. Why are phone numbers stored as digits and emails in lower case, and which later feature depends on that?
3. Where is "at least one of email or phone" enforced, and why in both the schema and the database?
4. Why do the form and the API share one Zod schema?
5. Why are invalid field values never written to the log?
6. Why does "not in the future" use the clinic timezone on the server, and what is the database check for, given it runs in UTC?
