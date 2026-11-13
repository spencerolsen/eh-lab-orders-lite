// The lab test seed function, run on the test database (not `pnpm db:seed`,
// which only ever targets the development database).
import { afterAll, beforeAll, expect, it } from 'vitest';
import type pg from 'pg';

import { seedLabTests } from '../../../db/seeds/lab-tests';
import { closePool } from '../db/pool';
import { createTestPool } from '../testing/harness';

let pool: pg.Pool;

beforeAll(() => {
  pool = createTestPool();
});

afterAll(async () => {
  await closePool(pool);
});

it('inserts the 8 tests once: a second run inserts nothing and leaves 8 rows', async () => {
  const client = await pool.connect();
  try {
    expect(await seedLabTests(client)).toBe(8);
    expect(await seedLabTests(client)).toBe(0);
  } finally {
    client.release();
  }

  const { rows } = await pool.query<{ code: string; is_active: boolean }>(
    'select code, is_active, turnaround_days from lab_tests order by code',
  );
  expect(rows.map((row) => row.code)).toEqual([
    'A1C',
    'CBC',
    'CMP',
    'CULT',
    'LIPID',
    'TSH',
    'UA',
    'VITD',
  ]);
  expect(rows.every((row) => row.is_active)).toBe(true);
});
