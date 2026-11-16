# LAB-26: Orders: sort the list by column

- **Status:** Done
- **Type:** Vertical slice
- **Depends on:** LAB-14 (Orders: filter the list by status and patient)
- **Unblocks:** nothing
- **Branch:** `lab-26-orders-sorting`

## Description

After this task, a user can click a column header on the Orders page to sort the list by that column, and click the same header again to reverse it. The sort sits in the address next to the filters, so it survives a reload and Back and Forward, and it combines with the status and patient filters.

The list is paged ("Load more"), so the server does the sorting: a browser can only sort the rows it has loaded.

## Owner decisions

These were decided before the build and are not open:

1. Sorting happens on the server, because the list is paged (`limit` and `offset`, "Load more"). The browser never sorts rows.
2. Exactly four columns are sortable: Patient, Ready by, Status, Created. Tests and Total are not: they are computed per order by `calculateTotal` from the item prices, not stored, and the database must not add up prices. Their headers stay plain text.
3. Status sorts in lifecycle order (ordered, collected, completed, cancelled), not alphabetically, taken from the shared `ORDER_STATUSES` list (already in that order), not a second list.
4. The default stays newest first (created, descending). With no sort in the address the page behaves exactly as before.
5. Orders page only. The order history on the patient page keeps its fixed newest-first order, with no sortable headers.

## Requirements

**API**
- `GET /api/orders` gains two optional query parameters in the existing strict `listOrdersQuery` schema (`src/shared/orders.ts`): `sort` is one of `created`, `readyBy`, `status`, `patient` (default `created`), `dir` is `asc` or `desc` (default `desc`). The lists are `ORDER_SORTS` and `ORDER_SORT_DIRS`. An unknown value is a 400 `VALIDATION_ERROR` in the same shape as the other parameters. Documented in `docs/api.md`.

**Server** (`listOrders` in `src/server/orders/repo.ts`)
- The `ORDER BY` text comes only from a fixed map keyed by the validated `sort` (`SORT_COLUMNS`), and the direction word from a second fixed map; user input is never put into SQL.
- Every ordering ends with the unique `o.id`, in the same direction, so paging is stable: the same order on every call, no row repeated or lost between pages. The inner page-cutting subquery and the outer query use the same text.
- Patient: `lower(p.last_name)`, `lower(p.first_name)`, then id. It needs the patients join inside the page cut, for that sort only; the other sorts keep the fast path (the page is cut from `orders` alone).
- Status: a `case` built from `ORDER_STATUSES`, so the lifecycle order has one source.
- Nulls: every sorted column is `not null` (`created_at`, `estimated_ready_date`, `status`, and the patient's two names), so there is no null placement to decide; written in the comment on the map.
- The default sort is unchanged: same SQL shape as before, same plan (reads `orders_created_at_id` and stops after `limit + 1`).
- Migration `0009_orders_ready_date_index.sql`: an index on (`estimated_ready_date`, `id`), added because `EXPLAIN` showed it used (below).

**Log**
- `orders.listed` (debug) also carries `sort` and `dir`: field names and a direction word, not patient data.

**UI** (`src/web/orders`)
- The sort lives in the address (`?sort=readyBy&dir=asc`), is left out when it is the default (Created, descending), survives reload and Back and Forward, and an unknown value is ignored as an unknown filter is. It combines with the filters, and changing it starts again from the first page (a new query key).
- Each sortable header is a real `<button>` inside its `<th>`; the `<th>` carries `aria-sort` (`ascending`, `descending`, `none`); the active column shows an arrow that is `aria-hidden`, and the button's name says the direction ("Sort by Status, now ascending"). The first click on a column not currently sorted is ascending, except Created, which starts descending. A second click reverses.
- Keyboard operable, with the shared focus outline. Because a new sort shows the loading state as a new filter does (the table, header included, is replaced by "Loading orders…"), the clicked button is focused again when the table returns.
- No optimistic updates: the filters' pattern is followed (a new query key, so the loading state, no kept rows).
- Styling only in `base.css` with the existing custom properties; a sortable header is on the `/styles` page.
- `OrdersTable` takes optional `sort` and `onSortChange`; without `onSortChange` (the patient page) the headers are plain text.

## Acceptance criteria

- [x] Each of the four sorts, in both directions, returns the right order (integration, real Postgres).
- [x] Status sorts in lifecycle order; patient sorts last then first name, ignoring case.
- [x] Rows with equal sort values come back in a stable order, and paging through with `limit=2` returns every order exactly once for every sort and direction.
- [x] Sort combines with the status filter, the patient filter and both.
- [x] `sort=bogus`, `sort=total`, `dir=up` and similar are 400 `VALIDATION_ERROR` with a request id.
- [x] No `sort` and `dir` returns the same list, in the same order, as before.
- [x] Clicking a header writes `sort` and `dir` to the address and requests the matching URL; the default is left out of both.
- [x] Tests and Total have no button; the patient page's history has no sort buttons or `aria-sort`.
- [x] Reloading keeps the sort and the order (browser journey).
- [x] This slice's manual checks are in `docs/acceptance-checklist.md` ("Orders list sorting (LAB-26)", under Checkpoint 2).

## Tests

**Unit:** `listOrdersQuery` accepts both parameters, defaults them and rejects unknown values (`src/shared/orders.test.ts`); reading, writing and the next-click rule for the sort in the address (`src/web/orders/filters.test.ts`).

**Integration** (`src/server/orders/list-sort.integration.test.ts`): the eight sort and direction pairs against an independently computed expectation (with ties in every column); status lifecycle order; patient last-then-first, case-insensitive; the same order twice; paging with `limit=2` for every sort and direction; sort with each filter and both; the log line; the 400 cases.

**Component** (`src/web/orders/OrdersSort.test.tsx`, plus one assertion in `PatientOrders.test.tsx` and the `/styles` page test): headers are buttons with the right `aria-sort`; clicks write the address and request the right URL; Tests and Total have no button; the keyboard works and focus returns; the patient history has none.

**Browser** (`e2e/filters.spec.ts`): sort by Ready by, reload, the order is kept; a second click reverses it, Back undoes it, and the sort stays when a filter is added.

## Docs updated

`docs/api.md`, `docs/architecture.md` (the orders table and "Scaling the orders list"), `docs/data-model.md` (the index and the sorts), `docs/data-flow.md`, `docs/testing.md`, `docs/acceptance-checklist.md`, `README.md` (features and known limits), `docs/plan/README.md`, `docs/plan/backlog.md`.

## EXPLAIN result

On 5,000 orders in a scratch database (`analyze` run first), unfiltered, 26 rows:

- Without an index: `Limit` over `Sort` (top-N heapsort) over a `Seq Scan` of all 5,000 rows, about 0.4 ms.
- With an index on (`estimated_ready_date`, `id`): `Index Scan` forward for ascending and `Index Scan Backward` for descending, reading 26 rows and stopping, about 0.02 ms. At `offset 2000` it read 2,026 rows, still from the index.
- With a status filter and the ready-date sort the planner also chose the new index (walking it and filtering); with a patient filter it kept `orders_patient_id_created_at_id` and sorted that patient's few orders.

The index is used, so migration 0009 was added. The status and patient sorts have no index and may scan; this is stated in the README's known limits and in the backlog.

## Out of scope

- Sorting by Tests or Total (the total is not stored).
- Sorting the patient page's order history.
- Multi-column sort, remembering the sort between visits, and sort on other pages.
- Cursor paging on the sort key, and an index for the status and patient sorts (backlog).

## What to be able to explain

1. Why does the sort have to be on the server when the list is paged?
2. Why does every ordering end with the order's `id`, and what goes wrong with offset paging without it?
3. Why can Tests and Total not be sorted, and what would it take?
4. Why does the patient sort need the patients join inside the page cut, and what does that cost?
5. Why is the status sort a `case` built from `ORDER_STATUSES` and not `order by status`?
