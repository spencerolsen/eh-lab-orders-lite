// One of two files that each insert a row into the same table: the second file
// to run must still start with it empty, because the harness truncates every
// table (except schema_migrations) before each file. The table is created here
// and left behind on purpose, since dropping it would hide a missing truncate.
import { afterAll, expect, it } from 'vitest';

import { closePool } from '../db/pool';
import { createTestPool } from './harness';

const pool = createTestPool();

afterAll(async () => {
  await closePool(pool);
});

it('starts with an empty table (second file)', async () => {
  await pool.query('create table if not exists harness_check (id int)');
  const before = await pool.query(
    'select count(*)::int as n from harness_check',
  );
  expect(before.rows[0]).toEqual({ n: 0 });

  await pool.query('insert into harness_check values (1)');
});
