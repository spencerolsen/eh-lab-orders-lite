# src/web

The browser app (React, Vite, React Router, TanStack Query). Feature pages go in `src/web/<feature>/` (for example `orders`, `patients`, `catalog`). The client (`api/`), the shared loading, empty and error components (`components/`) and the stylesheet (`styles/base.css`) are described in `AGENTS.md` and `docs/architecture.md`.

Web code may import from `src/shared`, never from `src/server`. The lint rule enforces this.
