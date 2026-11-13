// Runs against the test database (TEST_DATABASE_URL) with `pnpm test:integration`.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from './guards';
import { migrate, resetSchema } from './migrate';
import { closePool, createPool } from './pool';

const silent = () => {};
let pool: pg.Pool;
let dir: string;

beforeAll(() => {
  pool = createPool(testDatabaseUrl(process.env));
});

beforeEach(async () => {
  const client = await pool.connect();
  try {
    await resetSchema(client);
  } finally {
    client.release();
  }
  dir = await mkdtemp(path.join(tmpdir(), 'migrations-'));
});

afterAll(async () => {
  // Leave the test database in its normal migrated state.
  const client = await pool.connect();
  try {
    await resetSchema(client);
    await migrate(client, undefined, silent);
  } finally {
    client.release();
  }
  await closePool(pool);
});

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await pool.query<{ found: string | null }>(
    'select to_regclass($1) as found',
    [name],
  );
  return rows[0]?.found !== null;
}

async function recordedFiles(): Promise<string[]> {
  const { rows } = await pool.query<{ filename: string }>(
    'select filename from schema_migrations order by filename',
  );
  return rows.map((row) => row.filename);
}

describe('migrate', () => {
  it('migrate runs pending files once and records them', async () => {
    await writeFile(
      path.join(dir, '0001_first.sql'),
      'create table first_table (id int);',
    );
    await writeFile(
      path.join(dir, '0002_second.sql'),
      'create table second_table (id int);',
    );

    const client = await pool.connect();
    try {
      expect(await migrate(client, dir, silent)).toEqual([
        '0001_first.sql',
        '0002_second.sql',
      ]);
      expect(await migrate(client, dir, silent)).toEqual([]);
    } finally {
      client.release();
    }

    expect(await recordedFiles()).toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
    expect(await tableExists('second_table')).toBe(true);
    await rm(dir, { recursive: true });
  });

  it('migrate rolls back a failing file', async () => {
    await writeFile(
      path.join(dir, '0001_good.sql'),
      'create table good_table (id int);',
    );
    await writeFile(
      path.join(dir, '0002_broken.sql'),
      'create table half_table (id int);\nthis is not sql;',
    );
    await writeFile(
      path.join(dir, '0003_later.sql'),
      'create table later_table (id int);',
    );

    const client = await pool.connect();
    try {
      await expect(migrate(client, dir, silent)).rejects.toThrow(
        '0002_broken.sql',
      );
    } finally {
      client.release();
    }

    expect(await recordedFiles()).toEqual(['0001_good.sql']);
    expect(await tableExists('good_table')).toBe(true);
    expect(await tableExists('half_table')).toBe(false);
    expect(await tableExists('later_table')).toBe(false);
    await rm(dir, { recursive: true });
  });
});

describe('DATE type parser', () => {
  it('date type parser returns YYYY-MM-DD strings under a non-UTC timezone', async () => {
    const originalTz = process.env.TZ;
    try {
      for (const tz of ['America/Los_Angeles', 'Pacific/Auckland']) {
        process.env.TZ = tz;
        const { rows } = await pool.query<{ d: unknown }>(
          "select '2000-02-29'::date as d",
        );
        expect(rows[0]?.d).toBe('2000-02-29');
      }
    } finally {
      process.env.TZ = originalTz;
    }
  });
});
