# LAB-27: Catalog: confirm deactivation and search the list

- **Status:** Done
- **Type:** Vertical slice
- **Depends on:** LAB-07 (Catalog: edit and activate or deactivate tests)
- **Unblocks:** nothing
- **Branch:** `lab-27-catalog-confirm-and-search`

## Description

Two small changes on the Lab tests page. Deactivating a test now asks for confirmation first, and the list can be searched by code or name. No server, API or database change.

## Requirements

**A. Confirm before deactivating**
1. Deactivate opens a confirmation dialog; Activate stays one click.
2. The dialog is a native `<dialog>` opened with `showModal()`, in a small reusable `ConfirmDialog` (`src/web/components/ConfirmDialog.tsx`), used only by the catalog for now.
3. It names the test (code and name) and says what deactivating does: the test can no longer be added to new orders, and existing orders keep it. Two buttons: "Deactivate test" (danger) and "Keep active".
4. Focus goes to "Keep active" when it opens and back to the row button when it closes. Escape and "Keep active" close it and send nothing.
5. While the request runs both buttons are disabled, Escape does nothing and the dialog stays open. On success it closes and the list shows the new state. On failure the error is shown in the dialog with `ErrorMessage`, and the user can retry or close. No optimistic update.

**B. Search by code or name**
6. One search box above the table, with the visible label "Search by code or name".
7. A test matches when the text, trimmed, appears anywhere in its code or its name, ignoring case; an empty box shows every test. The rule is one pure function, `searchLabTests` (`src/web/catalog/search.ts`), which compares plain text (no pattern, so `( ) . * + ? [` mean themselves). Inactive tests are searched like active ones.
8. Filtering is immediate as the user types and sends no request.
9. When nothing matches, the page shows `EmptyState` with "No lab test matches this search." and a "Clear the search" button, a different message from the empty catalog. A polite live region says "3 of 8 tests".
10. The text is kept in the address as `?q=` (replacing history while typing, as the patient search does; omitted when empty), so a reload or Back keeps it. The input has `maxLength` `CATALOG_SEARCH_MAX_LENGTH` (100, in `src/shared/lab-tests.ts`), and a longer text in the address is cut.
11. Adding, editing, activating and deactivating while a search is active keep the search. An edited test that no longer matches leaves the list.

## Owner decision

The search runs **in the browser**, over the list the page already loaded. The catalog endpoint returns the whole catalog in one response (it is not paged, a stated known limit), so every row is already in the browser and a server search would add a round trip and a second code path for no gain. This is deliberately different from the orders list, which is paged and therefore filtered and sorted on the server. When the catalog is paged, the search moves to the server (README known limits, backlog).

## Acceptance criteria

- [x] Deactivate asks first; Keep active and Escape send nothing; Confirm sends one request (a double click too) and the row shows Inactive.
- [x] Focus goes into the dialog on its safe button and returns to the row button.
- [x] A failure shows in the dialog and can be retried; the buttons are disabled while the request runs.
- [x] The search matches code or name, any case, ignoring outer spaces, special characters as text; the no-match state and the count are shown; `?q=` round-trips.
- [x] No server, API or database change; no colour literal or media query added.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test` and `pnpm test:e2e` pass.

## Tests

Unit tests for `searchLabTests`. Component tests (`CatalogPage.test.tsx`) for the confirmation (opens naming the test, Keep and Escape send nothing, one request on confirm and on a double click, in-flight state, failure and retry, focus returns) and the search (code, name, case, spaces, special characters, no match, count, address in and out, kept after an edit, a deactivation and an add). One browser journey, `e2e/catalog.spec.ts`.

## Docs to update

- `README.md`, `AGENTS.md` (components list), `docs/architecture.md`, `docs/acceptance-checklist.md`, `docs/testing.md`, `docs/plan/README.md`, `docs/plan/backlog.md`.

## Out of scope

- Any server-side search, paging of the catalog, or a show/hide inactive control (the page has none; see the backlog).
- Using `ConfirmDialog` anywhere else.

## Notes from the build

- The quick-add box of the New order dialog already has its own matching function, `matchTests` (`src/shared/match-tests.ts`). Its rule is different (active tests only, ranked: code equal, code prefix, then name), so the orders code was not touched; the backlog notes that the two could share a normalising helper.
- The ticket asked for the search to combine with the page's show/hide inactive behaviour. The page has no such control, so every test is always listed and searched; a test checks that inactive tests are found.
