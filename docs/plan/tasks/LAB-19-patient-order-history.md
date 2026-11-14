# LAB-19: Patient page: order history

- **Status:** Done
- **Type:** Vertical slice
- **Depends on:** LAB-14 (Orders: filter the list by status and patient), LAB-15 (Orders: order detail slide-out panel)
- **Unblocks:** LAB-20 (New order from the patient page)
- **Branch:** `lab-19-patient-order-history`

## Description

After this task, a user who opens an existing patient sees every order that patient has, and can open any of them in the same slide-out panel used on the orders list, without leaving the patient page.

Nothing new is built on the server. The orders list already filters by patient (LAB-14) and the panel already exists (LAB-15). This task only adds a table to the patient page and wires the row click to the existing `OrderDetailPanel`. Starting a new order from this page is LAB-20.

## Requirements

**Data**
- No schema change. No migration.

**API**
- No new endpoint. The patient page calls `GET /api/orders?patientId=<uuid>`, built in LAB-14. The response is the LAB-11 row shape inside LAB-14's `{ items, hasMore }`.
- A `patientId` that is not a valid uuid already answers 400 `VALIDATION_ERROR`. A valid uuid for a patient that does not exist returns an empty list, because it is a filter and not a path resource.

**UI**
- The "Orders" section appears under the patient form only for an existing patient (`/patients/:id`). On the create form (`/patients/new`) the section is not rendered and no orders request is sent.
- The section is a table with columns: created date, status, ready date, total, number of tests. Newest order first, as on the orders list.
- Clicking a row opens the existing `OrderDetailPanel` over the patient page. The open order id is kept in the URL (`?order=<id>`, the same parameter the orders page uses), so the back button closes the panel and the link can be shared.
- Empty state: the text "No orders yet" when the list is empty.
- Error state: if the orders request fails, the section shows a plain-language message with the request id. The patient form above it still works.
- Loading more rows: the section uses the same "Load more" button and page size as the orders list (LAB-14), built from the same component, not a copy.

**Rules**
- No new business rules. Status changes and cancel happen inside the panel and are owned by LAB-16 and LAB-17.

**Logging**
- No new server events. The existing request log line carries the route and status. No patient names in logs.

**Tooling**
- None.

## Acceptance criteria

- [ ] A patient with two orders shows exactly those two orders on the patient page, and no order of any other patient.
- [ ] A patient with no orders shows "No orders yet".
- [ ] The create form at `/patients/new` shows no Orders section and sends no `GET /api/orders` request.
- [ ] Clicking a row opens the same panel as on the orders page, showing that order's tests, frozen prices, total and status.
- [ ] While the panel is open the URL contains `?order=<id>`; pressing the browser back button closes the panel and keeps the user on the patient page.
- [ ] Opening a URL with `?order=<id>` on the patient page opens the panel for that order on load.
- [ ] If the orders request fails, the section shows a message containing the request id, and the patient form can still be edited and saved.
- [ ] The patient page and the orders page use the same `OrderDetailPanel` and the same orders table component (one import each, no copy).
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 3).
- [ ] The docs/process.md slice log entry and test log entry for this task were written in the same pull request.

## Tests

- **Component (Vitest + React Testing Library), this task adds exactly these:**
  - `PatientOrders renders one row per order with status, ready date, total and test count`
  - `PatientOrders shows "No orders yet" for an empty list`
  - `PatientOrders shows a message with the request id when the request fails`
  - `PatientOrders row click sets the order search parameter and renders OrderDetailPanel`
  - `PatientPage in create mode does not render PatientOrders`
  - `PatientPage with ?order=<id> renders OrderDetailPanel on load`
- **Integration:** none. The `patientId` filter is tested in LAB-14.
- **e2e:** none. LAB-21 owns the browser journeys.

## Docs to update

- `docs/acceptance-checklist.md`: add the checks from the criteria above, under Checkpoint 3, subheading "Patient page".
- `docs/architecture.md`: state that `OrderDetailPanel` and the orders table are shared by the orders page and the patient page, and that the open order lives in the URL.
- `AGENTS.md`: one line saying a new place that shows orders reuses the shared table and panel and does not copy them.
- docs/process.md: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.

## Out of scope

- Starting a new order from the patient page: LAB-20.
- Filters on the patient's order list: the orders page already filters (LAB-14); this list shows all of one patient's orders.
- Editing orders: future version.
- Copying the patient's name onto the order for the paper requisition: future version.

## What to be able to explain

1. Why does the patient page reuse `GET /api/orders` with `patientId` and not get its own endpoint?
2. Why is the open order kept in the URL, and what does the back button do as a result?
3. What would go wrong if the patient page had its own copy of the panel?
4. What does the API return for a valid patient id that has no orders, and why is that not a 404?
5. Why is the Orders section left out of the create form?
