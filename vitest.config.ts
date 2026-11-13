import { configDefaults, defineConfig } from 'vitest/config';

// Unit tests: no database needed. Integration tests (*.integration.test.ts) run
// with `pnpm test:integration`, see vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'eslint-rules/**/*.test.js'],
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
