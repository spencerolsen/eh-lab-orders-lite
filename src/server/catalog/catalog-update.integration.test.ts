// PATCH /api/lab-tests/:id (and the absent DELETE) through HTTP (app.inject)
// on the real test database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { errorBodySchema } from '../../shared/api-error';
import { labTestSchema } from '../../shared/lab-tests';
import { startTestApp, type TestApp } from '../testing/harness';

let t: TestApp;

beforeAll(() => {
  t = startTestApp();
});

// The log lines written before the current test, which the checks skip.
let logsBefore = 0;

beforeEach(async () => {
  await t.pool.query('truncate lab_tests');
  logsBefore = t.logs().length;
});

afterAll(async () => {
  await t.close();
});

const UNKNOWN_ID = '10000000-0000-4000-8000-000000000404';

type StoredRow = {
  code: string;
  name: string;
  price_cents: number;
  turnaround_days: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

// Inserts CBC (or `code`) with updated_at a day in the past, so a test can
// see it move forward, and returns its id.
async function insertTest(code = 'CBC', isActive = true): Promise<string> {
  const { rows } = await t.pool.query<{ id: string }>(
    `insert into lab_tests
       (code, name, price_cents, turnaround_days, is_active, created_at, updated_at)
     values ($1, 'Complete Blood Count', 1000, 2, $2,
       now() - interval '1 day', now() - interval '1 day')
     returning id`,
    [code, isActive],
  );
  return (rows[0] as { id: string }).id;
}

async function stored(id: string): Promise<StoredRow | undefined> {
  const { rows } = await t.pool.query<StoredRow>(
    `select code, name, price_cents, turnaround_days, is_active,
       created_at, updated_at
     from lab_tests where id = $1`,
    [id],
  );
  return rows[0];
}

function patch(id: string, payload: unknown) {
  return t.inject({
    method: 'PATCH',
    url: `/api/lab-tests/${id}`,
    payload: payload as Record<string, unknown>,
  });
}

function testLogs() {
  return t.logs().slice(logsBefore);
}

function updatedEvents() {
  return testLogs().filter((line) => line.event === 'lab_test.updated');
}

describe('PATCH /api/lab-tests/:id', () => {
  it.each([
    {
      field: 'name',
      body: { name: '  Blood Count, Full ' },
      column: { name: 'Blood Count, Full' },
    },
    {
      field: 'priceCents',
      body: { priceCents: 2500 },
      column: { price_cents: 2500 },
    },
    {
      field: 'turnaroundDays',
      body: { turnaroundDays: 5 },
      column: { turnaround_days: 5 },
    },
    {
      field: 'isActive',
      body: { isActive: false },
      column: { is_active: false },
    },
  ])(
    'changes $field alone, keeps every other field, and moves updated_at forward',
    async ({ body, column }) => {
      const id = await insertTest();
      const before = (await stored(id)) as StoredRow;

      const response = await patch(id, body);

      expect(response.statusCode).toBe(200);
      const after = (await stored(id)) as StoredRow;
      expect(after).toEqual({
        ...before,
        ...column,
        updated_at: expect.any(Date) as Date,
      });
      expect(after.updated_at.getTime()).toBeGreaterThan(
        before.updated_at.getTime(),
      );
      expect(after.created_at).toEqual(before.created_at);
      expect(labTestSchema.parse(response.json())).toEqual({
        id,
        code: after.code,
        name: after.name,
        priceCents: after.price_cents,
        turnaroundDays: after.turnaround_days,
        isActive: after.is_active,
      });
    },
  );

  it('changes every field together and keeps the code', async () => {
    const id = await insertTest();

    const response = await patch(id, {
      name: 'Renamed',
      priceCents: 0,
      turnaroundDays: 365,
      isActive: false,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id,
      code: 'CBC',
      name: 'Renamed',
      priceCents: 0,
      turnaroundDays: 365,
      isActive: false,
    });
  });

  it('stores a price of 25.00 dollars as 2500 cents', async () => {
    const id = await insertTest();
    await patch(id, { priceCents: 2500 });
    expect((await stored(id))?.price_cents).toBe(2500);
  });

  it('deactivates and activates again, logging which way each time', async () => {
    const id = await insertTest('TSH');

    const off = await patch(id, { isActive: false });
    expect(off.json()).toMatchObject({ isActive: false });
    expect((await stored(id))?.is_active).toBe(false);

    const on = await patch(id, { isActive: true });
    expect(on.json()).toMatchObject({ isActive: true });
    expect((await stored(id))?.is_active).toBe(true);

    expect(updatedEvents()).toEqual([
      expect.objectContaining({
        level: 'info',
        labTestId: id,
        fieldCount: 1,
        active: 'deactivated',
      }),
      expect.objectContaining({
        level: 'info',
        labTestId: id,
        fieldCount: 1,
        active: 'activated',
      }),
    ]);
  });

  it('logs no active change when isActive is sent unchanged or not at all', async () => {
    const id = await insertTest();

    await patch(id, { isActive: true });
    await patch(id, { name: 'Renamed', priceCents: 1 });

    const events = updatedEvents();
    expect(events).toEqual([
      expect.objectContaining({ labTestId: id, fieldCount: 1 }),
      expect.objectContaining({ labTestId: id, fieldCount: 2 }),
    ]);
    expect(events.some((line) => 'active' in line)).toBe(false);
    // Nothing from the request body reaches the logs: no values, no names.
    const text = JSON.stringify(testLogs());
    expect(text).not.toContain('Renamed');
    expect(text).not.toContain('priceCents');
  });

  it.each([
    { what: 'the code alone', body: { code: 'NEW-1' } },
    { what: 'the code with a valid field', body: { code: 'NEW-1', name: 'X' } },
  ])(
    'refuses $what with 400 VALIDATION_ERROR on code and changes nothing',
    async ({ body }) => {
      const id = await insertTest();
      const before = await stored(id);

      const response = await patch(id, body);

      expect(response.statusCode).toBe(400);
      const error = errorBodySchema.parse(response.json()).error;
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual([
        { field: 'code', reason: 'is not an allowed field' },
      ]);
      expect(await stored(id)).toEqual(before);
    },
  );

  it.each([
    { what: 'an empty body', body: {}, fields: ['(input)'] },
    {
      what: 'a zero turnaround',
      body: { turnaroundDays: 0 },
      fields: ['turnaroundDays'],
    },
    {
      what: 'a turnaround over 365',
      body: { turnaroundDays: 366 },
      fields: ['turnaroundDays'],
    },
    {
      what: 'a negative price',
      body: { priceCents: -1 },
      fields: ['priceCents'],
    },
    { what: 'a blank name', body: { name: ' ' }, fields: ['name'] },
    // Postgres text cannot hold a NUL: without the schema's rule, a 500.
    { what: 'a NUL in the name', body: { name: 'a\u0000b' }, fields: ['name'] },
    {
      what: 'a string isActive',
      body: { isActive: 'false' },
      fields: ['isActive'],
    },
    {
      what: 'an unknown field',
      body: { name: 'Fine', isAdmin: true },
      fields: ['isAdmin'],
    },
  ])(
    'answers 400 VALIDATION_ERROR for $what, changes nothing and logs a warning',
    async ({ body, fields }) => {
      const id = await insertTest();
      const before = await stored(id);

      const response = await patch(id, body);

      expect(response.statusCode).toBe(400);
      const error = errorBodySchema.parse(response.json()).error;
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details?.map((d) => d.field)).toEqual(fields);
      expect(await stored(id)).toEqual(before);
      expect(updatedEvents()).toEqual([]);
      expect(
        testLogs().find(
          (line) =>
            line.event === 'request.rejected' &&
            line.requestId === error.requestId,
        ),
      ).toMatchObject({ level: 'warn', statusCode: 400 });
    },
  );

  it('answers 404 NOT_FOUND with the error shape and request id for an unknown id', async () => {
    await insertTest();

    const response = await patch(UNKNOWN_ID, { name: 'Renamed' });

    expect(response.statusCode).toBe(404);
    expect(errorBodySchema.parse(response.json()).error).toEqual({
      code: 'NOT_FOUND',
      message: 'There is no lab test with this id',
      requestId: response.headers['x-request-id'],
    });
    expect(updatedEvents()).toEqual([]);
  });

  it.each(['not-a-uuid', '123'])(
    'answers 400 VALIDATION_ERROR on id for the malformed id %j',
    async (id) => {
      const response = await patch(id, { name: 'Renamed' });

      expect(response.statusCode).toBe(400);
      const error = errorBodySchema.parse(response.json()).error;
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details?.map((d) => d.field)).toEqual(['id']);
    },
  );
});

describe('DELETE /api/lab-tests/:id', () => {
  it('is not routed: 404 NOT_FOUND, and the test is still there', async () => {
    const id = await insertTest();

    const response = await t.inject({
      method: 'DELETE',
      url: `/api/lab-tests/${id}`,
    });

    expect(response.statusCode).toBe(404);
    expect(errorBodySchema.parse(response.json()).error.code).toBe('NOT_FOUND');
    expect(await stored(id)).toBeDefined();
  });
});
