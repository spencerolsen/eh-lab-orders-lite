# LAB-10: Patients: duplicate warning on create

- **Status:** Not started
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

- [ ] Creating a patient with the same email as an existing one in different letter case returns 409 `POSSIBLE_DUPLICATE`, creates nothing, and the panel lists that patient with name, date of birth, email and phone.
- [ ] A phone typed as `(801) 555-0100` matches an existing patient stored as `8015550100`.
- [ ] Same first name, last name and date of birth in any letter case is a match; the same name with a different date of birth is not.
- [ ] Same last name only, or `Jon` against `John`, is not a match and the patient is created.
- [ ] Two patients that match by different rules both appear, each once.
- [ ] Open this patient goes to that patient's page, and the patient count is unchanged.
- [ ] Create anyway creates the patient (201) and the list shows both; the same request with `confirmDuplicate: true` sent directly also returns 201.
- [ ] An invalid body with a matching email returns 400, not 409; `confirmDuplicate: "yes"` returns 400.
- [ ] Editing a patient into another patient's email through the edit form saves with no warning.
- [ ] No log line contains a name, date of birth, email or phone number.
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 1).

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
