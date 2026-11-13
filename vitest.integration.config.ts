import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Integration tests run against the test database named by TEST_DATABASE_URL.
// The setting comes from the environment, or from .env when that file exists.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    // One test database, so files run one at a time.
    fileParallelism: false,
  },
});
