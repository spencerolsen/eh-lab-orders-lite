# LAB-14: Orders: filter the list by status and patient

- **Status:** Not started
- **Type:** Vertical slice
- **Depends on:** LAB-09 (Patients: search by name and edit a patient), LAB-11 (Orders: see orders on the home page)
- **Unblocks:** LAB-17 (Orders: cancel an order with a note and a name), LAB-19 (Patient page: order history), LAB-21 (Browser tests for the main journeys)
- **Branch:** lab-14-orders-list-filters

## Description

After this task, a user can narrow the orders list to one status, to one patient, or both, keep going with a "Load more" button, and share or bookmark the filtered view because the filters live in the URL.

LAB-11 returns every order in one response, which is fine for a seed but not for a list that only grows. This task adds the filters, a simple limit and offset scheme, and the indexes that match them. It changes only the list endpoint and the list page, so it depends only on LAB-11 and on the LAB-09 patient name search.

## Requirements

**Data**
- Migration adds indexes: (`created_at` desc, `id` desc) for the unfiltered list; (`status`, `created_at` desc, `id` desc); (`patient_id`, `created_at` desc, `id` desc). Index names state their columns. No new columns.

**API**
- `GET /api/orders` accepts: `status` (one of the values of `ORDER_STATUSES` from LAB-11; the schema is built from that list, not from a second typed list), `patientId` (uuid), `limit` (integer 1 to 100, default 25), `offset` (integer >= 0, default 0). Query schemas live in `src/shared/` and are parsed explicitly in the route.
- Filters combine with AND. Order is newest first with `id` as tie-breaker so paging is stable.
- The repository asks for `limit + 1` rows; if it gets `limit + 1`, `hasMore` is true and the extra row is dropped. There is no COUNT query.
- Response: `{ items, hasMore }`. Each item keeps the LAB-11 row shape. LAB-11 already returns `{ items, hasMore: false }`; this task only adds the `status`, `patientId`, `limit` and `offset` parameters and real `hasMore` paging.
- 400 `VALIDATION_ERROR` for an invalid `status`, a `patientId` that is not a uuid, a `limit` or `offset` out of range or not an integer, or an unknown query parameter.
- A `patientId` that matches no patient returns an empty list, not an error: it is a filter, not a resource in the path.

**UI**
- Above the table: a status select ("All statuses" plus one option per entry of `ORDER_STATUSES`, with the shared labels) and a patient filter using the LAB-09 name search (`GET /api/patients?q=`) and the `PatientLabel` component, with a clear button. Reuse `usePatientSearch(q)` and `useDebouncedValue(text)` from `src/web/patients/usePatientSearch.ts`, not a copy.
- The chosen status and patient id are kept in the URL (`?status=collected&patientId=...`). Opening that URL shows the same view; the back button steps through filter changes. Changing a filter resets to the first page.
- "Load more" appears only when `hasMore` is true, appends the next page, and disables itself while loading.
- No match shows "No orders match these filters" with a "Clear filters" button. "No orders yet" shows only when no filter is set. A failed request shows a plain message with the request id.

**Logging**
- `debug` with which filter names were present and the number of rows returned. No search text and no patient details.

## Acceptance criteria

- [ ] Choosing a status shows only orders in that status.
- [ ] Choosing a patient shows only that patient's orders; in a test that creates two patients with the same first and last name and different dates of birth, the two can be told apart by date of birth in the picker.
- [ ] Both filters together show only orders matching both.
- [ ] Reloading the page, or opening the URL in a new tab, restores the same filters and results.
- [ ] With 30 matching orders and the default limit of 25, the first page shows 25 and "Load more"; pressing it adds the last 5 and the button disappears.
- [ ] With exactly 25 matching orders, "Load more" does not appear.
- [ ] No match shows "No orders match these filters"; "Clear filters" restores the full list.
- [ ] `status=bogus`, `limit=0`, `limit=101`, `offset=-1`, `patientId=abc` and an unknown parameter each return 400 `VALIDATION_ERROR` with a request id.
- [ ] An unknown but valid-uuid `patientId` returns 200 with an empty `items` list.
- [ ] The response has no count of all matching orders, and the repository runs one query per request.
- [ ] This slice's manual checks are added to docs/acceptance-checklist.md under the checkpoint that covers it (Checkpoint 2).
- [ ] The docs/process.md slice log entry and test log entry were written in the same pull request.

## Tests

**Unit:** the pure function turning fetched rows and the limit into `items` and `hasMore` (fewer than, exactly, and one more than the limit); the function reading and writing filter state to and from a URL query string (defaults omitted, invalid values ignored).

**Integration** (real Postgres, HTTP): each filter alone and combined; newest-first with tie-break; two pages with no overlap or gap; the exactly-`limit` boundary; every 400 case; unknown patient returns an empty list; the `cancelled` filter returns cancelled rows, which the test inserts into the test database and truncates afterwards. No hand-inserted cancelled row is ever left in the development database. Index use is checked once by hand with `EXPLAIN` and recorded in docs/process.md.

**Component:** Load more visibility; empty state with Clear filters.

**E2E:** none here; the filter journey is LAB-21. The user-visible check that a cancelled order appears under the cancelled filter belongs to LAB-17.

## Docs to update

- `docs/api.md`: the query parameters, the `{ items, hasMore }` response, the 400 cases.
- `docs/data-model.md`: the three indexes and which query each serves.
- `docs/architecture.md`: scaling notes: why limit and offset with `limit + 1` instead of COUNT or cursors; cursor pagination and total counts as the next step; the trade-off accepted.
- `docs/acceptance-checklist.md`: add the filter checks under Checkpoint 2.
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry, including the `EXPLAIN` result.

## Out of scope

- Filtering by date range, test or total, and other sort orders: future version.
- "Page 3 of 12" or any total count: future version.
- Cursor (keyset) pagination: future version.
- The patient page's order history: LAB-19.
- Opening an order from the list: LAB-15.
- The user-visible cancelled-order check: LAB-17.

## What to be able to explain

1. How does fetching `limit + 1` rows tell you there is more, and why is that cheaper than a COUNT?
2. Why is an unknown `patientId` filter an empty list and not a 404 or a 422?
3. Which index serves which filter combination, and what happens to the query without them as the table grows?
4. Why keep the filters in the URL instead of component state?
5. What goes wrong with offset paging when new orders arrive while someone is paging, and what is the next step?
