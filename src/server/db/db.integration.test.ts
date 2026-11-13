// Runs against the test database (TEST_DATABASE_URL) with `pnpm test:integration`.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

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

afterEach(async () => {
  await rm(dir, { recursive: true });
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

async function write(file: string, sql: string): Promise<void> {
  await writeFile(path.join(dir, file), sql);
}

// Runs the migration runner on the temporary folder with one client.
async function runMigrate(): Promise<string[]> {
  const client = await pool.connect();
  try {
    return await migrate(client, dir, silent);
  } finally {
    client.release();
  }
}

describe('migrate', () => {
  it('migrate runs pending files once and records them', async () => {
    await write('0001_first.sql', 'create table first_table (id int);');
    await write('0002_second.sql', 'create table second_table (id int);');

    expect(await runMigrate()).toEqual(['0001_first.sql', '0002_second.sql']);
    expect(await runMigrate()).toEqual([]);

    expect(await recordedFiles()).toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
    expect(await tableExists('second_table')).toBe(true);
  });

  it('migrate rolls back a failing file', async () => {
    await write('0001_good.sql', 'create table good_table (id int);');
    // The create and the insert really run before the division fails.
    await write(
      '0002_broken.sql',
      'create table half_table (id int);\ninsert into half_table values (1);\nselect 1/0;',
    );
    await write('0003_later.sql', 'create table later_table (id int);');

    await expect(runMigrate()).rejects.toThrow('0002_broken.sql');

    expect(await recordedFiles()).toEqual(['0001_good.sql']);
    expect(await tableExists('good_table')).toBe(true);
    expect(await tableExists('half_table')).toBe(false);
    expect(await tableExists('later_table')).toBe(false);
  });

  it('migrate commits a file and its record together', async () => {
    // This file records itself, so the runner's own insert then fails on the
    // primary key. Only if the file and the runner's insert share one
    // transaction is the file's table rolled back along with it.
    await write(
      '0001_self.sql',
      "create table self_table (id int);\ninsert into schema_migrations (filename) values ('0001_self.sql');",
    );

    await expect(runMigrate()).rejects.toThrow('0001_self.sql');

    expect(await tableExists('self_table')).toBe(false);
    expect(await recordedFiles()).toEqual([]);
  });

  it('migrate refuses a file with its own transaction statements', async () => {
    await write(
      '0001_own_transaction.sql',
      'begin;\ncreate table inner_table (id int);\ncommit;',
    );

    await expect(runMigrate()).rejects.toThrow(
      /0001_own_transaction.sql contains its own begin, commit or rollback/,
    );
    expect(await tableExists('inner_table')).toBe(false);
    expect(await recordedFiles()).toEqual([]);
  });

  it('migrate refuses a file that is not named NNNN_description.sql', async () => {
    await write('10_unpadded.sql', 'create table unpadded (id int);');

    await expect(runMigrate()).rejects.toThrow(
      /10_unpadded.sql is not named like 0001_description.sql/,
    );
    expect(await tableExists('unpadded')).toBe(false);
  });

  it('migrate refuses a pending file older than the newest applied one', async () => {
    await write('0001_first.sql', 'create table first_table (id int);');
    await write('0003_third.sql', 'create table third_table (id int);');
    await runMigrate();
    await write('0002_late.sql', 'create table late_table (id int);');

    await expect(runMigrate()).rejects.toThrow(
      /0002_late.sql sorts before 0003_third.sql, which is already applied/,
    );
    expect(await tableExists('late_table')).toBe(false);
    expect(await recordedFiles()).toEqual(['0001_first.sql', '0003_third.sql']);
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
      // Assigning undefined would store the string "undefined".
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});
