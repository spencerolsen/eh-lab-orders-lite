import { existsSync } from 'node:fs';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The proxy targets the port the API listens on: the same PORT setting the
// API reads, from the environment first, then from .env. `pnpm dev` puts the
// checked value in the environment of both the API and Vite. 3000 is the
// API's own default (src/server/config.ts), for `pnpm dev:web` with no PORT.
if (existsSync('.env')) process.loadEnvFile('.env');
const apiUrl = `http://localhost:${process.env.PORT || '3000'}`;

// The web app: index.html at the root loads src/web/main.tsx.
export default defineConfig({
  plugins: [react()],
  server: {
    // A fixed port, so the address in the README is always right; if 5173 is
    // taken, Vite stops with an error instead of picking another one.
    port: 5173,
    strictPort: true,
    // The browser talks only to Vite; Vite forwards API calls to the API, so
    // there is one origin and no CORS setup.
    proxy: { '/api': apiUrl, '/healthz': apiUrl },
  },
  build: { outDir: 'dist/web', emptyOutDir: true },
});
