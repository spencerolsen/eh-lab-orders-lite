import { existsSync } from 'node:fs';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { configDefaults, defineConfig } from 'vitest/config';

// The integration tests read TEST_DATABASE_URL from .env (copy .env.example
// to .env first). Values already in the environment win, which is how CI,
// with no .env file, provides it.
if (existsSync('.env')) process.loadEnvFile('.env');

// Test files run in file-path order, the same on every machine and every run.
// (Vitest's default order depends on earlier runs.) The two harness files in
// src/server/testing/truncate-*.integration.test.ts rely on it: they run one
// after the other, with no schema reset between them.
class FilePathOrder extends BaseSequencer {
  override sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return Promise.resolve(
      [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId)),
    );
  }
}

// `pnpm test` runs both projects. One project alone: `pnpm test --project unit`.
export default defineConfig({
  test: {
    sequence: { sequencer: FilePathOrder },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}', 'eslint-rules/**/*.test.js'],
          exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.test.ts'],
          globalSetup: ['src/server/testing/global-setup.ts'],
          setupFiles: ['src/server/testing/setup.ts'],
          // One test database, so the files run one at a time.
          fileParallelism: false,
        },
      },
    ],
  },
});
