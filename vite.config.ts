import { existsSync } from 'node:fs';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { DEFAULT_PORT } from './src/server/config';

// The proxy targets the port the API listens on: the same PORT setting, read
// from the environment first, then from .env (as the API does), else the
// API's own default.
if (existsSync('.env')) process.loadEnvFile('.env');
const apiUrl = `http://localhost:${process.env.PORT || DEFAULT_PORT}`;

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
