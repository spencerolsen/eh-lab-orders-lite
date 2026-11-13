# LAB-20: New order from the menu bar and the patient page

- **Status:** Not started
- **Type:** Vertical slice
- **Depends on:** LAB-18 (Orders: a double-click or retry cannot create a duplicate order), LAB-19 (Patient page: order history)
- **Unblocks:** LAB-21 (Browser tests for the main journeys), LAB-22 (Docs and README, final pass)
- **Branch:** `lab-20-new-order-entry-points`

## Description

After this task, a user can start a new order from three places: the orders page, the menu bar on every page, and the patient page. All three open the same modal component. From the patient page the patient is already filled in; from the other two the user must pick the patient first.

The modal (LAB-12, LAB-13) and its idempotency key (LAB-18) already exist. This task adds the two new places it opens from and the patient-fixed mode. The rule that tests cannot be added before a patient is chosen belongs to LAB-12 and still holds when the modal is opened from the menu bar. Nothing is built twice.

## Requirements

**Data**
- No schema change. No migration.

**API**
- No new endpoint and no change to existing ones. The order is still placed with `POST /api/orders` and the Idempotency-Key header from LAB-18. A patient id that does not exist is still refused with 422 `UNKNOWN_PATIENT`.

**UI**
- Menu bar: a button with the label and accessible name "New order", visible on every page (orders, patients, patient page, catalog). It opens `NewOrderModal`.
- Patient page (existing patient only): a button with the label and accessible name "New order for this patient" next to the Orders section heading, so it does not share a name with the menu-bar button or the orders-page button. It opens `NewOrderModal` with that patient.
- The orders page keeps its own button, with the label and accessible name "Place new order" (the menu-bar button, "New order", is also on that page, so the two have different names). It opens the same component. Tickets and tests refer to each button by its own name.
- Opened from the patient page: the patient is prefilled and shown as fixed text (name and date of birth) with a "change" link. Keyboard focus lands in the quick-add box. Clicking "change" turns the text back into the patient search and disables quick-add until a patient is selected again.
- Opened from the menu bar or orders page: the patient search is shown first and focused. The quick-add box is disabled, with the hint "Choose a patient first", until a patient is selected. Selecting a patient enables it.
- Changing the patient inside an open modal keeps tests already added.
- After a successful order from the patient page, the modal closes and the patient's orders list refreshes without a reload. From the menu bar or orders page, the modal closes and the order appears on the orders list, as before.
- The idempotency key is generated each time the modal opens. It is kept while the modal stays open (including a change of patient and a failed submit) and is replaced the next time the modal opens.
- The modal's open state is held by the page that opens it, passed in as props (`patientId` optional). The modal does not read the route.

**Rules**
- No new business rules. The "Submit order" button stays disabled until a patient and at least one test are chosen.

**Logging**
- No new server events. The existing `order.created` line is unchanged. No patient names in logs.

**Tooling**
- None.

## Acceptance criteria

- [ ] The "New order" button is present in the menu bar on the orders page, patients list, patient page, patient create page and catalog page.
- [ ] On the orders page there are two buttons with different accessible names, "New order" (menu bar) and "Place new order" (page), and both open the same modal; a locator for either name matches exactly one element.
- [ ] On the patient page the button "New order for this patient" opens the modal, and it opens with the patient's name and date of birth as fixed text, a "change" link, and keyboard focus in the quick-add box.
- [ ] Clicking "change" shows the patient search; quick-add is disabled until another patient is selected, and the saved order belongs to the newly chosen patient.
- [ ] From the menu bar or the orders page, the modal opens with no patient chosen, the patient search focused, and quick-add disabled with the hint "Choose a patient first".
- [ ] Selecting a patient enables quick-add; tests added before a patient change stay in the list after the change.
- [ ] Placing an order from the patient page adds it to that patient's list with no manual reload.
- [ ] Closing the modal and opening it again produces a different idempotency key; changing the patient inside one open modal does not.
- [ ] When the server answers 422 `UNKNOWN_PATIENT`, the modal shows the message with the request id and stays open with its tests intact.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 3).
- [ ] The docs/process.md slice log entry and test log entry for this task were written in the same pull request.

## Tests

- **Component (Vitest + React Testing Library), this task adds exactly these:**
  - `NewOrderModal with a patient shows fixed text and focuses quick-add`
  - `NewOrderModal "change" link shows the patient search and disables quick-add`
  - `NewOrderModal without a patient disables quick-add with the hint until one is selected`
  - `NewOrderModal keeps added tests when the patient changes`
  - `NewOrderModal generates a new idempotency key on each open and keeps it across a patient change`
  - `NewOrderModal shows the request id when the server answers UNKNOWN_PATIENT`
  - `AppShell renders the "New order" button on every route`
  - `OrdersPage renders a "Place new order" button that opens NewOrderModal, besides the menu-bar "New order" button`
  - `PatientPage renders a "New order for this patient" button that opens NewOrderModal with that patient`
  - `PatientPage refreshes PatientOrders after an order is placed`
- **Integration:** none. The unknown patient rule and idempotency are tested in LAB-12 and LAB-18.
- **e2e:** none. LAB-21 owns the browser journeys.

## Docs to update

- `docs/acceptance-checklist.md`: add the checks from the criteria above, under Checkpoint 3, subheadings "New order modal" and "Patient page".
- `docs/architecture.md`: note that one `NewOrderModal` serves three entry points and is told its patient by props.
- `docs/data-flow.md`: in the create-order diagram, show that the key is created when the modal opens.
- `AGENTS.md`: one line saying a new entry point reuses `NewOrderModal` and does not copy it.
- docs/process.md: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.

## Out of scope

- The idempotency behaviour on the server: LAB-18.
- Known limitation: If a submit fails after the server already created the order, and the user then changes the patient or tests in the same open modal and resubmits, the server returns the first order as a success. Accepted by the candidate for this exercise; the fix (a new key whenever the content changes, plus a server-side fingerprint check returning 422) is recorded in the README's known limitations.
- The live total and ready date in the modal: LAB-13.
- Pasting a list of tests into quick-add: future version.
- Remembering a half-filled modal after it is closed: future version.

## What to be able to explain

1. Why is there one modal component for three entry points, and what would go wrong with copies?
2. Why is quick-add disabled until a patient is chosen, and what does the server do if a request still arrives without a valid patient?
3. Why is a new idempotency key made each time the modal opens, and why is it not replaced when the patient changes?
4. When the user clicks "change" in the patient-fixed modal, what stays the same and what is reset?
5. Why does the modal take the patient as a prop and not read the route?
