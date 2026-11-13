# src/server

The API server (Node, Fastify, Postgres). Feature code goes in `src/server/<feature>/` (for example `orders`, `patients`, `catalog`). `app.ts` builds the app, `main.ts` starts it, and `errors.ts`, `parse.ts`, `logger.ts` and `request-id.ts` are shared by every route. See `docs/architecture.md` and, for adding a route, `AGENTS.md`.

Server code may import from `src/shared`, never from `src/web`. The lint rule enforces this.
