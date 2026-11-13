# Lab Orders Lite

A small clinic app: keep a list of patients and a catalog of lab tests, place orders for a patient, and see each order's total and the date its results should be ready.

This is an early stub. The full README is written in LAB-22.

## Prerequisites

- Node 22 (the exact major version is in `.nvmrc`)
- pnpm, through Corepack (`corepack enable`); the version is pinned in `package.json`
- Docker, for the Postgres database (added in LAB-02)

## Commands

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
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
