# Lab Orders Lite

[![CI](https://github.com/spencerolsen/eh-lab-orders-lite/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/spencerolsen/eh-lab-orders-lite/actions/workflows/ci.yml)

A small clinic app: keep a list of patients and a catalog of lab tests, place orders for a patient, and see each order's total and the date its results should be ready.

This is an early stub. The full README is written in LAB-22.

## Prerequisites

- Node 22 (the exact major version is in `.nvmrc`)
- Docker, for the Postgres database

pnpm comes with Node through Corepack; you do not install it separately. Run every command through Corepack, which uses the pnpm version pinned in `package.json` (the first run downloads it):

```sh
corepack pnpm install
corepack pnpm dev
```

To type plain `pnpm` instead, run `corepack enable` once. If Node was installed with the nodejs.org installer, this needs `sudo corepack enable`, because it writes to `/usr/local/bin`. The rest of this README writes `corepack pnpm`; after `corepack enable`, plain `pnpm` does the same.

## Running the app

```sh
corepack pnpm install
corepack pnpm dev
```

Then open http://localhost:5173. `corepack pnpm dev` does everything else, in order:

1. If there is no `.env`, copies `.env.example` to `.env` and prints one line saying so (the defaults work with the Docker database). Then it checks every setting and stops with the config error if one is missing or malformed.
2. Checks that Docker is running; if not, prints one line and exits with an error.
3. Checks that the database URLs use the container's port (`DB_PORT`), and that ports 3000 (the API, from `PORT`) and 5173 (Vite, from `WEB_PORT`) are free; if one is taken, prints one line naming it and exits with an error. It also stops with one line if `PORT` and `WEB_PORT` are the same (a value set in your shell overrides `.env`).
4. Starts Postgres in Docker and waits until it is healthy (the `db:up` script), applies pending migrations (`db:migrate`) and runs the seed (`db:seed`). The seed runs every time: every row has a fixed key and is inserted with `on conflict do nothing`, so a second run inserts 0 rows.
5. Runs the API (http://localhost:3000, restarting when a server file changes) and the web app (Vite, http://localhost:5173) together, each output line prefixed `[api]` or `[web]`. Ctrl-C stops both.

The browser talks only to Vite, which forwards `/api` and `/healthz` to the API on the `PORT` setting. One side alone, for debugging: `corepack pnpm dev:api` or `corepack pnpm dev:web`. `corepack pnpm build` builds the web app into `dist/web`. `corepack pnpm start` runs the API without watching, with JSON log lines.

## Checks

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test           # unit, component and integration tests; needs .env (pnpm dev creates it), starts the database container itself
corepack pnpm format:check
corepack pnpm build
```

The same checks run automatically on GitHub for every pull request and every push to `main` (`.github/workflows/ci.yml`, the badge above): install with the frozen lockfile, lint, type check, formatting, build, then all unit, component and integration tests against a Postgres 16 service container. Browser tests are not part of them; they run locally (LAB-21).

## Database

Postgres 16 runs in Docker on host port 5433 (the `DB_PORT` setting, so it does not clash with a local Postgres on 5432). It holds two databases: `lab_orders` for development and `lab_orders_test` for tests.

```sh
cp .env.example .env            # settings (pnpm dev does this for you when .env is missing)
corepack pnpm db:up             # start Postgres and wait until it is healthy
corepack pnpm db:migrate        # apply pending migrations
corepack pnpm db:seed           # insert the fake sample data
corepack pnpm db:reset          # start the development database over: drop, migrate, seed
corepack pnpm db:test:reset     # start the test database over: drop, migrate
corepack pnpm db:down           # stop the database (the data is kept)
```

The init script that creates `lab_orders_test` runs only when the database volume is first created. If `lab_orders_test` is missing (for example because the volume is older than the script), run `docker compose down -v` and then `corepack pnpm db:up` again. This deletes all local data.

## Running a second copy

Two copies of the project (two clones, or one per ticket) can run at the same time, each with its own database container and data volume, `pnpm dev` and `pnpm test`. In the second copy's `.env`, change these lines (a third copy uses 5435, 3002, 5175 and `lab-orders-lite-3`):

```sh
COMPOSE_PROJECT_NAME=lab-orders-lite-2
DB_PORT=5434
DATABASE_URL=postgres://lab_orders:lab_orders@localhost:5434/lab_orders
TEST_DATABASE_URL=postgres://lab_orders:lab_orders@localhost:5434/lab_orders_test
PORT=3001
WEB_PORT=5174
```

Then open http://localhost:5174. `DB_PORT` and the port in both URLs must be the same: `pnpm dev` and `pnpm test` stop with one line if a URL on `localhost` uses another port, because it would reach another copy's database. `corepack pnpm db:down` in a copy stops only that copy's container; `docker compose down -v` there deletes only that copy's data.

## Docs

- [Build plan](docs/plan/README.md)
- [Architecture](docs/architecture.md)
- [API](docs/api.md)
- [Data model](docs/data-model.md)
- [Data flow](docs/data-flow.md)
- [Testing](docs/testing.md)
- [Acceptance checklist](docs/acceptance-checklist.md)
- [How the codebase is organised (for people and AI assistants)](AGENTS.md)
