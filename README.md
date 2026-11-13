# Lab Orders Lite

A small clinic app: keep a list of patients and a catalog of lab tests, place orders for a patient, and see each order's total and the date its results should be ready.

This is an early stub. The full README is written in LAB-22.

## Prerequisites

- Node 22 (the exact major version is in `.nvmrc`)
- pnpm, through Corepack (`corepack enable`); the version is pinned in `package.json`
- Docker, for the Postgres database

## Commands

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

## Database

Postgres 16 runs in Docker on host port 5433 (so it does not clash with a local Postgres on 5432). It holds two databases: `lab_orders` for development and `lab_orders_test` for tests.

```sh
cp .env.example .env     # settings; the defaults work with the Docker database
pnpm db:up               # start Postgres and wait until it is healthy
pnpm db:migrate          # apply pending migrations
pnpm db:seed             # insert the fake sample data
pnpm db:reset            # start the development database over: drop, migrate, seed
pnpm db:test:reset       # start the test database over: drop, migrate
pnpm test:integration    # integration tests against the test database
pnpm db:down             # stop the database (the data is kept)
```

## Docs

- [Build plan](docs/plan/README.md)
- [Architecture](docs/architecture.md)
- [API](docs/api.md)
- [Data model](docs/data-model.md)
- [Data flow](docs/data-flow.md)
- [Testing](docs/testing.md)
- [Acceptance checklist](docs/acceptance-checklist.md)
- [How the codebase is organised (for people and AI assistants)](AGENTS.md)
