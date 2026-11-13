# LAB-09: Patients: search by name and edit a patient

- **Status:** Not started
- **Type:** Vertical slice
- **Depends on:** LAB-08 (Patients: add and list patients)
- **Unblocks:** LAB-10 (Patients: duplicate warning on create), LAB-12 (Orders: place an order), LAB-14 (Orders: filter the list by status and patient)
- **Branch:** `lab-09-patients-search-and-edit`

## Description

After this task, a user can type part of a name into a search box on the Patients list, open a patient's page, and correct their details with the same form that creates patients.

Search and the single-patient endpoint come before placing an order because LAB-12 picks a patient by name search and shows their date of birth. The `PatientLabel` built in LAB-08 is reused here and on later screens.

## Requirements

**Data**
- No new columns and no migration. `updated_at` is set on every edit.

**API**
- `GET /api/patients?q=` returns patients whose name matches, same shape and sort as LAB-08. Without `q`, or with an empty `q`, it returns all patients.
- Matching: the trimmed `q` is a case-insensitive substring match (`ILIKE`) against first name, last name, and `first_name || ' ' || last_name`, so `jane`, `SMITH` and `jane sm` all find Jane Smith. `%` and `_` in `q` are escaped and the value is always a bound parameter. `q` longer than 100 characters returns 400 `VALIDATION_ERROR`. Search is by name only (not date of birth, email or phone).
- `GET /api/patients/:id` returns 200; 404 `NOT_FOUND` if the id does not exist; 400 `VALIDATION_ERROR` if it is not a uuid.
- `PATCH /api/patients/:id` with any subset of `{ firstName, lastName, dateOfBirth, email, phone }`. Each field sent follows the create rules (normalization, real date, not in the future); email or phone may be `null` to clear it. Returns 200 with the full patient. Unknown keys and an empty body return 400 `VALIDATION_ERROR`.
- After the change, at least one of email or phone must remain. The update is attempted as one SQL `UPDATE ... RETURNING`; a violation of the email-or-phone CHECK constraint (LAB-08) is caught and mapped to 422 `CONTACT_REQUIRED` with details on `email` and `phone`, and nothing is changed. It is 422 and not 400 because the request is well formed and breaks the rule only in combination with stored data. There is no separate read first, so there is no read-then-write gap.
- A `dateOfBirth` in the request is checked "not in the future" with `today(timezone, now)` from LAB-08, called as `today(CLINIC_TIMEZONE, clock())` on the server (the browser calls it with its own timezone and `new Date()` as an advisory check). The database check (`date_of_birth <= current_date + 1`) stays a loose backstop in the database's timezone (UTC).
- 404 `NOT_FOUND` if the patient does not exist. Schemas live in `src/shared/`; routes parse explicitly and call the repo directly (no service yet).

**UI**
- Patients list: a search box above the table. The text is kept in the URL (`/patients?q=smith`), the request is sent 300 ms after typing stops, and "No patients match" shows when there are no results. Rows link to the patient page.
- `PatientForm` (LAB-08) takes the schema it checks with as a prop (the create schema for a new patient, the update schema here), and a small function maps a `Patient` to the form's text values (`null` email or phone becomes `''`).
- Patient page at `/patients/:id`: the `PatientForm` from LAB-08 in edit mode, filled with stored values. Save sends only changed fields; success shows "Saved" and stays on the page. A missing patient shows a not-found message with a link to the list. The page heading uses `PatientLabel`.

**Logging**
- `info` `patient.updated` with `patientId` and the names of changed fields, never values. `debug` `patient.search` with `resultCount` and `hasQuery` only, never the text. `warn` on 422 and validation failures.

## Acceptance criteria

- [ ] Searching `smith`, `SMITH` and `Sm` all find a patient named Jane Smith, and `jane sm` finds her too.
- [ ] Searching `zzz` shows "No patients match" and no rows; clearing the box shows every patient again.
- [ ] Searching `%` or `_` returns zero patients when no name contains those characters.
- [ ] After a search, reloading the page keeps the search text and the same results.
- [ ] Clicking a row opens the patient page with the stored values; changing the phone and saving shows "Saved", and the list shows the new phone.
- [ ] Clearing both email and phone in the form and saving shows the contact error under both fields and changes nothing.
- [ ] `PATCH { "email": null }` on a patient with no phone returns 422 `CONTACT_REQUIRED`; on a patient with a phone it returns 200.
- [ ] `GET` or `PATCH` of a well-formed unknown id returns 404 `NOT_FOUND` with the error shape and a request id; a malformed id returns 400.
- [ ] A date of birth edited to a future date or `2020-02-30` is rejected with a field error; an accepted edit shows no day shift.
- [ ] `PATCH` with `{}` or an unknown key returns 400.
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.
- [ ] With the injected clock set just before midnight clinic time, an edit to the clinic's today is accepted and to the clinic's tomorrow is rejected.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 1).

## Tests

- **Unit:** the LIKE-escape helper; the update schema (strict, partial, `null` clearing, rejects `{}`).
- **Integration:** search by first name, last name, full name, mixed case, partial; no match returns `[]`; wildcard characters are literal; long `q` returns 400; get by id (200, 404, 400); patch each field; a patch that breaks the contact rule (the CHECK violation) returns 422 `CONTACT_REQUIRED` and changes nothing; one test with the injected clock set just before midnight clinic time for the date of birth check; patch normalizes phone and email; `updated_at` advances.
- **Component:** the search box debounces and writes `q` to the URL; `PatientForm` in edit mode sends only changed fields.
- **E2E:** none here; journeys are LAB-21.

## Docs to update

- `docs/api.md`: the `q` parameter and matching rules, `GET` and `PATCH` by id, the 400 versus 422 split.
- `docs/architecture.md`: one form for create and edit; where `PatientLabel` is used.
- `docs/acceptance-checklist.md`: search and edit checks (Checkpoint 1).
- `docs/data-model.md`: note that the date-of-birth database check is `date_of_birth <= current_date + 1` because the database runs in UTC (a day ahead of or behind the clinic) and is a loose backstop that must never reject a date the code accepts; the clinic-timezone check is in the schema.
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry; record that search text is logged by count only, and the last-save-wins limitation.
- `docs/plan/`: set this task's status.

## Out of scope

- Warning about duplicates: LAB-10 (create only, not edit).
- Searching by date of birth, email or phone: future version.
- Paging the list: future version.
- The patient's order history on the page: LAB-19.
- Two people editing the same patient at once (last save wins): future version; gathered in the README by LAB-22.

## What to be able to explain

1. Why is search text never logged, and what is logged instead?
2. Why does the contact-required failure on `PATCH` return 422 when the same mistake on create returns 400?
3. How is the search kept safe from injection and from `%` and `_`?
4. How does one `PatientForm` serve both create and edit, and what differs?
5. How does the update know that clearing the last contact field is not allowed without reading the patient first, and why is that safer than read, check, then write?
