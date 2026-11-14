# LAB-20: New order from the patient page

- **Status:** Done
- **Type:** Vertical slice
- **Depends on:** LAB-18 (Orders: a double-click or retry cannot create a duplicate order), LAB-19 (Patient page: order history)
- **Unblocks:** LAB-21 (Browser tests for the main journeys), LAB-22 (Docs and README, final pass)
- **Branch:** `lab-20-new-order-entry-points`

## Description

After this task, a user can start a new order from exactly two places: "Place new order" on the orders page and "New order for this patient" on the patient page. Both open the same modal component. From the patient page the patient is already filled in; from the orders page the user must pick the patient first.

**Decision by the owner, after this ticket was first written:** there is no "New order" entry in the menu bar. The menu bar only navigates (Orders, Patients, Catalog).

The modal (LAB-12, LAB-13) and its idempotency key (LAB-18) already exist. This task adds the patient-page entry point and the patient-fixed mode. The rule that tests cannot be added before a patient is chosen belongs to LAB-12 and still holds when the modal is opened from the orders page. Nothing is built twice.

## Requirements

**Data**
- No schema change. No migration.

**API**
- No new endpoint and no change to existing ones. The order is still placed with `POST /api/orders` and the Idempotency-Key header from LAB-18. A patient id that does not exist is still refused with 422 `UNKNOWN_PATIENT`.

**UI**
- No menu-bar button: the menu bar is unchanged.
- Patient page (existing patient only): a button with the label and accessible name "New order for this patient" next to the Orders section heading. It opens `NewOrderModal` with that patient.
- The orders page keeps its own button, with the label and accessible name "Place new order" (LAB-12). It opens the same component. Tickets and tests refer to each button by its own name.
- Opened from the patient page: the patient is prefilled and shown with name and date of birth and the modal's usual "Change" button. Keyboard focus lands in the quick-add box (once the tests have loaded). Clicking "Change" turns it back into the patient search and disables quick-add until a patient is selected again.
- Opened from the orders page: the patient search is shown first and focused. The quick-add box is disabled, with the hint "Choose a patient first", until a patient is selected. Selecting a patient enables it.
- Changing the patient inside an open modal keeps tests already added.
- After a successful order from the patient page, the modal closes and the patient's orders list refreshes without a reload. From the orders page, the modal closes and the order appears on the orders list, as before.
- The idempotency key is generated each time the modal opens. It is kept while the modal stays open (including a change of patient and a failed submit) and is replaced the next time the modal opens.
- The modal's open state is held by the page that opens it, passed in as props (`patientId` optional). The modal does not read the route.

**Rules**
- No new business rules. The "Submit order" button stays disabled until a patient and at least one test are chosen.

**Logging**
- No new server events. The existing `order.created` line is unchanged. No patient names in logs.

**Tooling**
- None.

## Acceptance criteria

- [x] The menu bar has no "New order" button or link on any page (orders, patients, patient page, patient create page, catalog).
- [x] The orders page has one button, "Place new order", that opens the modal; a locator for that name matches exactly one element.
- [x] On the patient page the button "New order for this patient" opens the modal, and it opens with the patient's name and date of birth, a "Change" button, and keyboard focus in the quick-add box.
- [x] Clicking "Change" shows the patient search; quick-add is disabled until another patient is selected, and the saved order belongs to the newly chosen patient.
- [x] From the orders page, the modal opens with no patient chosen, the patient search focused, and quick-add disabled with the hint "Choose a patient first".
- [x] Selecting a patient enables quick-add; tests added before a patient change stay in the list after the change.
- [x] Placing an order from the patient page adds it to that patient's list with no manual reload.
- [x] Closing the modal and opening it again produces a different idempotency key; changing the patient inside one open modal does not. This holds from both entry points.
- [x] When the server answers 422 `UNKNOWN_PATIENT`, the modal shows the message with the request id and stays open with its tests intact.
- [x] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 3).

## Tests

- **Component (Vitest + React Testing Library), in `src/web/patients/PatientNewOrder.test.tsx`:**
  - `"New order for this patient" opens the modal with that patient chosen and the focus in quick-add` (including that "Change" brings back the patient search and disables quick-add)
  - `"Place new order" on the orders page opens the modal with no patient chosen`
  - `the patient page has the one button, and no other page has it`
  - `there is no "New order" button or link in the menu bar, on any page`
  - `an order placed from the patient page closes the modal and shows in the history without a reload`
  - `each opening of the modal sends a new idempotency key, from the patient page` and `..., from the orders page`
- Already covered by `src/web/orders/NewOrderModal.test.tsx` (LAB-12, LAB-18), which opens the modal from the orders page: quick-add disabled with "Choose a patient first" until a patient is chosen, tests kept when the patient changes, one key kept across a failed submit, the server's message with its request id.
- **Integration:** none. The unknown patient rule and idempotency are tested in LAB-12 and LAB-18.
- **e2e:** none. LAB-21 owns the browser journeys.

## Docs to update

- `docs/acceptance-checklist.md`: add the checks from the criteria above, under Checkpoint 3, subheadings "New order modal" and "Patient page".
- `docs/architecture.md`: note that one `NewOrderModal` serves two entry points and is told its patient by props.
- `docs/data-flow.md`: in the create-order diagram, show that the key is created when the modal opens.
- `AGENTS.md`: one line saying a new entry point reuses `NewOrderModal` and does not copy it.
- The menu-bar decision: every doc that named a menu-bar "New order" now says there is none (plan README, LAB-04, LAB-12, LAB-18, LAB-19, LAB-21, LAB-23, the acceptance checklist, `docs/architecture.md`, `docs/testing.md`).

## Out of scope

- The idempotency behaviour on the server: LAB-18.
- Known limitation: If a submit fails after the server already created the order, and the user then changes the patient or tests in the same open modal and resubmits, the server returns the first order as a success. Accepted by the candidate for this exercise; the fix (a new key whenever the content changes, plus a server-side fingerprint check returning 422) is recorded in the README's known limitations.
- The live total and ready date in the modal: LAB-13.
- Pasting a list of tests into quick-add: future version.
- Remembering a half-filled modal after it is closed: future version.

## What to be able to explain

1. Why is there one modal component for two entry points, and what would go wrong with copies?
2. Why is quick-add disabled until a patient is chosen, and what does the server do if a request still arrives without a valid patient?
3. Why is a new idempotency key made each time the modal opens, and why is it not replaced when the patient changes?
4. When the user clicks "Change" in the patient-fixed modal, what stays the same and what is reset?
5. Why does the modal take the patient as a prop and not read the route?
