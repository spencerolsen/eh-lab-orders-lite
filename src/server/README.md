# src/server

The API server (Node, Fastify, Postgres). Feature code goes in `src/server/<feature>/` (for example `orders`, `patients`, `catalog`).

Server code may import from `src/shared`, never from `src/web`. The lint rule enforces this.
