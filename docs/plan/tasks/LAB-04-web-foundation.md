# LAB-04: Web foundation: app shell and navigation

- **Status:** Not started
- **Type:** Groundwork
- **Depends on:** LAB-03 (API foundation: server, logging, errors, health)
- **Unblocks:** LAB-05 (Checks on every pull request)
- **Branch:** `lab-04-web-foundation`

## Description

This task builds the browser side of the skeleton: a React app with a menu bar (Orders, Patients, Catalog) and three placeholder pages, a client that talks to the API and turns its error shape into a plain-language message, shared loading, empty and error components, and a fallback screen for crashes. It also sets up component tests and adds the one command, `pnpm dev`, that starts the whole app.

It comes right after the API foundation because the client must understand the error shape defined there, and before any feature slice so that each slice only adds a page's content, not plumbing. After this, a reviewer can clone the repo, run `pnpm install` once, then `pnpm dev`, and see the app running.

## Requirements

**UI**
- Vite + React + TypeScript under `src/web/`, entry `index.html`, `src/web/main.tsx`, `src/web/App.tsx`. Routing with React Router: `/` Orders (the home page), `/patients`, `/catalog`. Unknown paths show a "Page not found" screen with a link home.
- Menu bar on every page with three links (Orders, Patients, Catalog); the current section is visually marked and has `aria-current="page"`. The menu bar reserves a place for the "New order" button, which LAB-20 fills in; it is not shown yet.
- Each placeholder page has a heading and one line saying what will appear there.
- Shared components in `src/web/components/`: `Loading` (text with `role="status"`), `EmptyState` (message and optional action), `ErrorMessage` (message plus request id, with a retry button when a retry function is given). An error boundary wraps the app and shows a fallback screen ("Something went wrong. Reload the page.") instead of a blank page, and writes the error to the browser console.
- Plain CSS in `src/web/styles/base.css`: colour and spacing variables, readable default type, visible focus outlines, a layout that works from 360 px wide. No component library.

**API**
- The Vite dev server proxies `/api` and `/healthz` to the API at `http://localhost:${PORT}`, so the browser talks to one origin and no CORS setup is needed.
- `src/web/api/client.ts`: an `apiFetch` wrapper around `fetch`. On a non-2xx response it reads the standard error body and throws an `ApiError` carrying `status`, `code`, `message`, `details` and `requestId`. If the response is not in the standard shape (for example the API is down and the proxy returns 502), it throws an `ApiError` with the message "Can't reach the server. Try again." and no request id.
- `src/web/api/errors.ts`: `describeError(error)` returns the text to show. 400, 409 and 422 show the server's message; 5xx and network errors show a generic message; every message ends with "Reference: <requestId>" when an id exists.
- TanStack Query `QueryClientProvider` set up in `main.tsx`: no automatic retry on 4xx, one retry on network errors, `refetchOnWindowFocus` off.

**Tooling**
- Setup is `pnpm install` (a documented prerequisite step), then `pnpm dev`. `pnpm dev` runs one script that: copies `.env.example` to `.env` when `.env` is missing and prints one line saying so (settings validation from LAB-02 still refuses to start when a setting is missing or malformed); starts Docker Compose (`db:up`) and waits until the database is healthy; runs `db:migrate`; ALWAYS runs `db:seed` (each seeded row has a fixed key (a fixed UUID, or for `order_items` its primary key) and is inserted with `on conflict do nothing`, so a second run changes nothing); then starts the API (with file watching) and the Vite dev server together, with prefixed output. Ctrl-C stops both. If Docker is not running, the script prints one line saying so and exits non-zero.
- ESLint gives `src/web` browser globals, and `src/server` plus the config files Node globals. `DOM` is added to the TypeScript `lib`. With one `tsconfig.json`, Node types stay visible in web code; that is accepted as the cost of a single tsconfig.
- `pnpm build` builds the web app to `dist/web`. `dev:api` and `dev:web` run each side alone for debugging.
- Component tests: Vitest with `jsdom` and Testing Library, set up here as a separate Vitest project. `pnpm test` runs unit, component and integration tests. The lint rule from LAB-01 keeps `src/web` from importing `src/server`.

## Acceptance criteria

- [ ] On a fresh clone, `pnpm install` then `pnpm dev` brings up the database, migrates, seeds, and serves the app in the browser; no other command is needed, including no manual copy of `.env.example`.
- [ ] With no `.env` file, `pnpm dev` prints one line saying it copied `.env.example`, then starts.
- [ ] Running `pnpm dev` a second time against an already seeded database inserts 0 rows (the seed runs, and every row conflicts on its fixed key).
- [ ] With a malformed setting in `.env`, `pnpm dev` still refuses to start with the config error.
- [ ] The menu bar shows Orders, Patients and Catalog on every page; clicking each changes the URL and the page without a full reload, and the current section has `aria-current="page"`.
- [ ] Loading `/does-not-exist` shows the "Page not found" screen.
- [ ] Opening `/healthz` through the dev server returns the API's response (the proxy works).
- [ ] With the API stopped, the page shows "Can't reach the server. Try again.", not a blank page or a raw error.
- [ ] An API response with status 422 shows the server's message and its request id.
- [ ] A component that throws during render shows the fallback screen.
- [ ] The layout has no horizontal scroll at 360 px width, and every link and button can be reached with the keyboard.
- [ ] `pnpm build` succeeds, and `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.
- [ ] The `docs/process.md` slice log entry and test log entry for this task were written in the same pull request.

## Tests

- **Component (jsdom + Testing Library):** `error boundary renders the fallback when a child throws`; `menu bar marks the current section`; `ErrorMessage shows a retry button only when given a retry function`; `not found route shows the page not found screen`.
- **Unit (web):** `apiFetch throws ApiError with code, message and requestId from the standard shape`; `apiFetch handles a non-JSON 502 with the plain message`; `describeError appends the request id`.
- No integration or browser tests here; the first browser journey arrives in LAB-21.

## Docs to update

- `README.md` (`pnpm install`, then `pnpm dev`, ports, prerequisites; `.env` is created from `.env.example` automatically), `AGENTS.md` (web folder layout, where the client and shared components live).
- `docs/architecture.md` (browser to Vite proxy to API to database; the error flow to the screen).
- `docs/data-flow.md` (first diagram: the path of an API error from server to the message on screen).
- `docs/testing.md` (the component test layer and how to run it).
- `docs/acceptance-checklist.md`: add the app-starts and menu checks under Checkpoint 1.
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.

## Out of scope

- Real page content: catalog LAB-06, patients LAB-08, orders LAB-11.
- The "New order" modal: LAB-12. The button in the menu bar: LAB-20.
- Serving the built web app from the API: future version; the reviewer runs the dev setup.
- A component library, dark mode, translations: future version.

## What to be able to explain

1. Why does the browser talk only to Vite, and what does the proxy replace?
2. How does an error travel from a thrown `ConflictError` on the server to the sentence on screen, and where does the request id come from?
3. Why are loading, empty and error handled by shared components?
4. What does the error boundary catch, and what does it not catch (for example a failed request)?
5. What does `pnpm dev` do, step by step, and why is it safe to run the seed every time?
