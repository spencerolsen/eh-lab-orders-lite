# src/web

The browser app (React, Vite). Feature pages go in `src/web/<feature>/` (for example `orders`, `patients`, `catalog`).

Web code may import from `src/shared`, never from `src/server`. The lint rule enforces this.
