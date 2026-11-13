// The catalog through HTTP (app.inject) on the real test database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { errorBodySchema } from '../../shared/api-error';
import { labTestListSchema, labTestSchema } from '../../shared/lab-tests';
import { startTestApp, type TestApp } from '../testing/harness';
import { type LabTestRow, toLabTest } from './repo';

let t: TestApp;

beforeAll(() => {
  t = startTestApp();
});

beforeEach(async () => {
  await t.pool.query('truncate lab_tests');
});

afterAll(async () => {
  await t.close();
});

const demo = {
  code: 'demo-09',
  name: 'Demo Panel',
  priceCents: 1999,
  turnaroundDays: 2,
};

function post(payload: Record<string, unknown>) {
  return t.inject({ method: 'POST', url: '/api/lab-tests', payload });
}

async function insertRow(
  code: string,
  options: {
    isActive?: boolean;
    priceCents?: number;
    turnaround?: number;
  } = {},
) {
  await t.pool.query(
    `insert into lab_tests (code, name, price_cents, turnaround_days, is_active)
     values ($1, $2, $3, $4, $5)`,
    [
      code,
      `Test ${code}`,
      options.priceCents ?? 1000,
      options.turnaround ?? 1,
      options.isActive ?? true,
    ],
  );
}

// Waits until `count` statements are waiting for a lock on lab_tests.
async function waitForBlockedInserts(count: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await t.pool.query<{ n: number }>(
      `select count(*)::int as n from pg_locks
       where relation = 'lab_tests'::regclass and not granted`,
    );
    if (rows[0]?.n === count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${count} inserts never waited for the table lock`);
}

async function rowCount(): Promise<number> {
  const { rows } = await t.pool.query<{ n: number }>(
    'select count(*)::int as n from lab_tests',
  );
  return rows[0]?.n ?? -1;
}

describe('GET /api/lab-tests', () => {
  it('returns every test sorted by code, inactive ones included', async () => {
    await insertRow('TSH');
    await insertRow('A1C', { isActive: false });
    await insertRow('CBC', { priceCents: 2500, turnaround: 3 });

    const response = await t.inject({ method: 'GET', url: '/api/lab-tests' });

    expect(response.statusCode).toBe(200);
    const list = labTestListSchema.parse(response.json());
    expect(list.map((test) => test.code)).toEqual(['A1C', 'CBC', 'TSH']);
    expect(list[0]?.isActive).toBe(false);
    expect(list[1]).toEqual({
      id: expect.any(String) as string,
      code: 'CBC',
      name: 'Test CBC',
      priceCents: 2500,
      turnaroundDays: 3,
      isActive: true,
    });
  });

  it('returns an empty array when there are no tests', async () => {
    const response = await t.inject({ method: 'GET', url: '/api/lab-tests' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});

describe('POST /api/lab-tests', () => {
  it('creates an active test, stores whole cents and logs its id only', async () => {
    const response = await post(demo);

    expect(response.statusCode).toBe(201);
    const created = labTestSchema.parse(response.json());
    expect(created).toEqual({
      id: expect.any(String) as string,
      code: 'DEMO-09',
      name: 'Demo Panel',
      priceCents: 1999,
      turnaroundDays: 2,
      isActive: true,
    });

    const { rows } = await t.pool.query<{ price_cents: number; code: string }>(
      'select code, price_cents from lab_tests where id = $1',
      [created.id],
    );
    expect(rows).toEqual([{ code: 'DEMO-09', price_cents: 1999 }]);

    const events = t.logs().filter((line) => line.event === 'lab_test.created');
    expect(events).toEqual([
      expect.objectContaining({ level: 'info', labTestId: created.id }),
    ]);
    expect(t.logText()).not.toContain('Demo Panel');
    expect(t.logText()).not.toContain('DEMO-09');
  });

  it.each(['CBC', 'cbc', ' Cbc '])(
    'answers 409 DUPLICATE_TEST_CODE for the existing code CBC sent as %j',
    async (code) => {
      await insertRow('CBC');

      const response = await post({ ...demo, code });

      expect(response.statusCode).toBe(409);
      const body = errorBodySchema.parse(response.json());
      expect(body.error).toEqual({
        code: 'DUPLICATE_TEST_CODE',
        message: 'This code already exists',
        requestId: response.headers['x-request-id'],
      });
      expect(await rowCount()).toBe(1);

      const warning = t
        .logs()
        .find(
          (line) =>
            line.event === 'lab_test.duplicate_code' &&
            line.requestId === body.error.requestId,
        );
      expect(warning).toMatchObject({ level: 'warn' });
      expect(JSON.stringify(warning)).not.toContain('CBC');
    },
  );

  it('lets only one of two simultaneous requests with the same code win', async () => {
    // Force the two requests to overlap. A share lock on the table, held by
    // a separate connection, lets selects through but makes every insert
    // wait. Once both inserts are waiting, both requests have done anything
    // they do before inserting (a check-then-insert would have found no row
    // in both), and releasing the lock lets them race for the constraint.
    const locker = await t.pool.connect();
    let responses;
    try {
      await locker.query('begin');
      await locker.query('lock table lab_tests in share mode');
      const both = Promise.all([post(demo), post(demo)]);
      await waitForBlockedInserts(2);
      await locker.query('commit');
      responses = await both;
    } finally {
      locker.release();
    }

    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await rowCount()).toBe(1);
  });

  it.each([
    {
      name: 'a string priceCents',
      payload: { ...demo, priceCents: '1999' },
      field: 'priceCents',
    },
    {
      name: 'a missing code',
      payload: { name: 'Demo Panel', priceCents: 1999, turnaroundDays: 2 },
      field: 'code',
    },
    {
      name: 'an unknown extra field',
      payload: { ...demo, isAdmin: true },
      field: 'isAdmin',
    },
    {
      name: 'a negative price',
      payload: { ...demo, priceCents: -1 },
      field: 'priceCents',
    },
    {
      name: 'a zero turnaround',
      payload: { ...demo, turnaroundDays: 0 },
      field: 'turnaroundDays',
    },
    { name: 'a blank name', payload: { ...demo, name: '  ' }, field: 'name' },
  ])(
    'answers 400 VALIDATION_ERROR naming the field for $name',
    async ({ payload, field }) => {
      const response = await post(payload);

      expect(response.statusCode).toBe(400);
      const body = errorBodySchema.parse(response.json());
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.requestId).toBe(response.headers['x-request-id']);
      expect(body.error.details?.map((d) => d.field)).toEqual([field]);
      expect(await rowCount()).toBe(0);
    },
  );
});

describe('the lab_tests table', () => {
  it.each([
    { name: 'a negative price', values: ['NEG', 'Negative', -1, 1] },
    { name: 'a zero turnaround', values: ['ZERO', 'Zero', 100, 0] },
    { name: 'a turnaround over 365', values: ['LONG', 'Long', 100, 366] },
    { name: 'a lower-case code', values: ['cbc', 'Lower', 100, 1] },
    { name: 'a blank code', values: ['  ', 'Blank code', 100, 1] },
    { name: 'a blank name', values: ['BLANK', ' ', 100, 1] },
  ])('rejects a row with $name', async ({ values }) => {
    await expect(
      t.pool.query(
        `insert into lab_tests (code, name, price_cents, turnaround_days)
         values ($1, $2, $3, $4)`,
        values,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects a second row with the same code', async () => {
    await insertRow('CBC');
    await expect(insertRow('CBC')).rejects.toMatchObject({
      code: '23505',
      constraint: 'lab_tests_code_key',
    });
  });

  it('gives a new row an id, active, and both timestamps', async () => {
    await insertRow('CBC');
    const { rows } = await t.pool.query<Record<string, unknown>>(
      'select id, is_active, created_at, updated_at from lab_tests',
    );
    expect(rows[0]).toEqual({
      id: expect.any(String) as string,
      is_active: true,
      created_at: expect.any(Date) as Date,
      updated_at: expect.any(Date) as Date,
    });
  });
});

describe('the row mapper', () => {
  it('fails loudly when a column is missing', async () => {
    await insertRow('CBC');
    const { rows } = await t.pool.query<LabTestRow>(
      'select id, code, price_cents, turnaround_days, is_active from lab_tests',
    );
    expect(() => toLabTest(rows[0] as LabTestRow)).toThrow();
  });
});
