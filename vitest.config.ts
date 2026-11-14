import { existsSync } from 'node:fs';

import react from '@vitejs/plugin-react';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { configDefaults, defineConfig } from 'vitest/config';

// The integration tests read TEST_DATABASE_URL from .env (copy .env.example
// to .env first). Values already in the environment win, which is how CI,
// with no .env file, provides it.
if (existsSync('.env')) process.loadEnvFile('.env');

// Test files run in file-path order, the same on every machine and every run
// (Vitest's default order depends on earlier runs). Every file passes in any
// order, but the check that tables are truncated between files does not: the
// LAB-02 migration test (db/) drops the whole schema, and if it ran between
// testing/truncate-first and truncate-second, the second would find no table
// and pass even with truncation broken. In path order db/ always runs first.
class FilePathOrder extends BaseSequencer {
  override sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return Promise.resolve(
      [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId)),
    );
  }
}

// `pnpm test` runs all five projects. One project alone, for example
// `pnpm test --project unit`. The file name decides the project:
//   <name>.test.ts              unit (Node, no database)
//   <name>.test.tsx             component (jsdom and Testing Library)
//   <name>.integration.test.ts  integration (the test database)
// The tests that work out or show a calendar day (a ready date, a date of
// birth) run a second time, in the "dates-west" projects, with the process in
// Pacific/Honolulu (UTC-10). A calendar day handled through a JavaScript Date
// read in local time is right in UTC and a day early west of it, so a run that
// is only ever in UTC (as CI's is) would not see that bug. Every machine runs
// both. A new test file that checks a calendar day is added to this list.
const WEST_OF_UTC = { TZ: 'Pacific/Honolulu' };
const CALENDAR_DAY_UNIT_TESTS = [
  'src/shared/dates.test.ts',
  'src/shared/patients.test.ts',
  'src/server/orders/domain/ready-date.test.ts',
  'src/web/patients/form-values.test.ts',
];
const CALENDAR_DAY_COMPONENT_TESTS = [
  'src/web/orders/NewOrderModal.test.tsx',
  'src/web/orders/OrderDetailPanel.test.tsx',
  'src/web/orders/OrdersPage.test.tsx',
  'src/web/patients/NewPatientPage.test.tsx',
  'src/web/patients/PatientForm.test.tsx',
  'src/web/patients/PatientLabel.test.tsx',
  'src/web/patients/PatientPage.test.tsx',
  'src/web/patients/PatientsPage.test.tsx',
];
const unitFiles = {
  include: ['src/**/*.test.ts', 'eslint-rules/**/*.test.js'],
  exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
};
const componentFiles = {
  include: ['src/**/*.test.tsx'],
  environment: 'jsdom' as const,
  setupFiles: ['src/web/testing/setup.ts'],
};

export default defineConfig({
  test: {
    sequence: { sequencer: FilePathOrder },
    projects: [
      { test: { name: 'unit', ...unitFiles } },
      {
        test: {
          name: 'dates-west-unit',
          include: CALENDAR_DAY_UNIT_TESTS,
          env: WEST_OF_UTC,
        },
      },
      { plugins: [react()], test: { name: 'component', ...componentFiles } },
      {
        plugins: [react()],
        test: {
          name: 'dates-west-component',
          ...componentFiles,
          include: CALENDAR_DAY_COMPONENT_TESTS,
          env: WEST_OF_UTC,
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
