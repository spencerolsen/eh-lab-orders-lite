# LAB-10: Patients: duplicate warning on create

- **Status:** In progress
- **Type:** Vertical slice
- **Depends on:** LAB-09 (Patients: search by name and edit a patient)
- **Unblocks:** LAB-21 (Browser tests for the main journeys), LAB-22 (Docs and README, final pass)
- **Branch:** `lab-10-patients-duplicate-warning`

## Description

After this task, a user who creates a patient who looks like someone already in the system sees the matching patients, and can open one instead or choose Create anyway to add the new patient regardless.

Duplicate records split a patient's history across two charts, so the app warns. Two real people can share an email, phone, or name and birth date, so it never blocks. This task adds a patients service (`src/server/patients/service.ts`) because a real rule now exists; the principle is that a service is added where there is a transaction or business rule to own. The other patient routes keep calling the repository directly. It follows LAB-09 because "Open this patient" needs the patient page.

## Requirements

**Data**
- No new columns and no unique constraint (a unique constraint would block, the opposite of the rule). Indexes on `lower(email)`, `phone`, and `(lower(first_name), lower(last_name), date_of_birth)` are added in a plain SQL migration.

**Rules**
- A stored patient is a likely duplicate if any one holds: same email (lower-case compare, only when the new patient has an email); same phone (digits only, only when it has a phone); same first name, last name and date of birth (case-insensitive, exact). Last name alone never matches. No fuzzy matching.
- The phone rule compares the stored 10 digits (LAB-08 stores a US number as exactly 10 digits, area code first, with any leading 1 dropped), so `+1 (801) 555-0100` and `801.555.0100` are the same phone.
- One pure function `matchRules(candidate, existing)` returns which rules matched (`email`, `phone`, `name_dob`), with no database or framework import. A repository query fetches candidates in one SQL statement.

**API**
- `POST /api/patients` accepts an extra optional boolean `confirmDuplicate`. The body is validated first: a bad body is 400 `VALIDATION_ERROR` and is never reported as a duplicate. A non-boolean `confirmDuplicate` is 400.
- Without `confirmDuplicate: true`, when there is at least one match nothing is created and the response is 409 `POSSIBLE_DUPLICATE` in the standard error shape, with `details.matches`: up to 10 of `{ id, firstName, lastName, dateOfBirth, email, phone }`, sorted by last name, then first name.
- With `confirmDuplicate: true` the check is skipped and the patient is created (201). The flag is never stored.
- No match: 201 as in LAB-08. The check and insert are not locked together, so two simultaneous creates of the same person may both succeed; accepted, because the rule warns and does not block.
- The route calls the service, which calls the repo. The edit endpoint is unchanged and runs no duplicate check.

**UI**
- On 409 `POSSIBLE_DUPLICATE`, a warning panel above the form lists each match with `PatientLabel`, email and phone, and an "Open this patient" link to `/patients/:id`. A Create anyway button resends the same values with `confirmDuplicate: true`; one sentence explains it adds a second record.
- Form values stay filled while the warning shows. Changing any field removes the warning, and the next submit checks again. Buttons are disabled while a request runs.

**Logging**
- `warn` `patient.possible_duplicate` with `matchCount` on the 409. `debug` with matched patient ids and the rule names, never values. `info` `patient.created` gains `duplicateConfirmed: true` when the flag was used.

## Acceptance criteria

- [x] Creating a patient with the same email as an existing one in different letter case returns 409 `POSSIBLE_DUPLICATE`, creates nothing, and the panel lists that patient with name, date of birth, email and phone.
- [x] A phone typed as `(801) 555-0100` matches an existing patient stored as `8015550100`.
- [x] Same first name, last name and date of birth in any letter case is a match; the same name with a different date of birth is not.
- [x] Same last name only, or `Jon` against `John`, is not a match and the patient is created.
- [x] Two patients that match by different rules both appear, each once.
- [x] Open this patient goes to that patient's page, and the patient count is unchanged.
- [x] Create anyway creates the patient (201) and the list shows both; the same request with `confirmDuplicate: true` sent directly also returns 201.
- [x] An invalid body with a matching email returns 400, not 409; `confirmDuplicate: "yes"` returns 400.
- [x] Editing a patient into another patient's email through the edit form saves with no warning.
- [x] No log line contains a name, date of birth, email or phone number.
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.
- [x] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 1).

## Tests

- **Unit:** `matchRules` for each rule alone, all three, none, empty email and phone never matching each other, letter-case differences, last name only.
- **Integration (real Postgres):** the candidate query finds each rule's matches (case-insensitive email and name, digits-only phone); 409 shape and `details.matches` fields; no row on 409; `confirmDuplicate: true` creates; invalid body wins over duplicate; the flag is not stored; edit does not warn.
- **Component:** the warning panel renders matches, hides on field change, and Create anyway resends with the flag.
- **E2E:** none added here; the duplicate-warning journey is LAB-21.

## Docs to update

- `docs/api.md`: `confirmDuplicate`, the 409 `POSSIBLE_DUPLICATE` body, the three matching rules.
- `docs/architecture.md`: the first service in patients and why only this rule needs one.
- `docs/data-flow.md`: the duplicate-check branch of patient creation.
- `docs/acceptance-checklist.md`: duplicate-warning checks (Checkpoint 1).
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry; record the create race and the no-fuzzy-matching limitation here.
- `docs/plan/`: set this task's status.

## Out of scope

- Fuzzy matching, nicknames or typos: future version (AI-assisted matching is on the future list).
- Merging two patient records: future version.
- A duplicate check on edit: not built.
- The browser test of this journey: LAB-21.
- Closing the race between two simultaneous creates: deliberately not done.

## What to be able to explain

1. Why does the API warn with a 409 instead of blocking, and how does `confirmDuplicate` override it?
2. Why are the three rules exact matches, and why is last name alone not one?
3. Why does this feature get a service when the other patient routes do not?
4. Why does a bad body return 400 even when a duplicate exists?
5. What can still produce a duplicate despite the check, and why is that accepted?

## Build notes

Decisions made while building, and what this version deliberately accepts:

- **The rule** lives in one pure function, `matchRules(candidate, existing)` in `src/server/patients/domain/duplicates.ts`, with the rule written as a comment above it. The rule names (`email`, `phone`, `name_dob`) are `DUPLICATE_RULES` in `src/shared/patients.ts`. Names and emails are compared trimmed and ignoring case; phones as the stored 10 digits; dates exactly. A missing email or phone never matches a missing one.
- **One candidate query**, `findDuplicateCandidates` in `src/server/patients/repo.ts`, compares `lower(email)`, `phone`, `lower(first_name)`, `lower(last_name)` and `date_of_birth` against bound parameters, sorted by last name then first name, `limit 10`. `matchRules` then labels each row. Migration `0005_patient_duplicate_indexes.sql` adds one plain index per rule, on the same expressions; at a clinic's size Postgres scans the table anyway, but every create runs the query, and the indexes keep it a lookup as the table grows.
- **The matches are in `error.matches`**, beside `details`, not in `details.matches`: `details` is a list of field problems on every other error, and the web client and the form read it that way. The standard error schema (`src/shared/api-error.ts`) has `matches` as an optional list of patients.
- **The matches are patient data sent to any caller.** There is no login in this version, so that is by design; with logins it would need a permission check (recorded in `docs/plan/backlog.md`).
- **The race is accepted.** The check and the insert are not locked together, so two identical creates at the same moment can both succeed. The check warns, it does not guarantee (backlog).
- **Exact means exact.** `Jon` is not `John`, and names that differ only by an accent (`Zoe`, `Zoë`) do not match (backlog).
- **Logs.** `patient.possible_duplicate` at `warn` with `code`, `matchCount` and `rules`; `patient.possible_duplicate.matches` at `debug` with the matched ids and their rules; `patient.created` gains `duplicateConfirmed: true`. An integration test triggers each rule with marker values and checks, with the logger at debug, that no marker reaches the log.
- **The form.** `DuplicateWarning` sits above `PatientForm` on the New patient page only; it is an alert region that takes focus. Create anyway is a secondary button; Save patient stays the primary one. `PatientForm` gained a `busy` prop so Save patient is disabled while Create anyway runs.
- **Existing tests** that create several patients sharing an email now send `confirmDuplicate: true` in their setup helper; the check itself is tested in `duplicates.integration.test.ts`.
- The `docs/process.md` criterion is not done here: the process log is kept outside the repository.
