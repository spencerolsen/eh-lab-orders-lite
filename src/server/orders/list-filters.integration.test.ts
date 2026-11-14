// GET /api/orders with filters and paging (LAB-14), through the app on the
// test database. The cancelled rows exist only inside these tests: every test
// file starts from empty tables (setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { orderListSchema, type OrderList } from '../../shared/orders';
import {
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import {
  CBC,
  insertCatalogAndPatients,
  insertOrder,
  PATIENT_A,
  PATIENT_B,
} from './fixtures';

let t: TestApp;

beforeAll(() => {
  t = startTestApp();
});

beforeEach(async () => {
  await truncateAllTables(t.pool);
  await insertCatalogAndPatients(t.pool);
});

afterAll(async () => {
  await t.close();
});

const id = (n: number) =>
  `40000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

async function list(query = ''): Promise<OrderList> {
  const response = await t.inject({
    method: 'GET',
    url: `/api/orders${query}`,
  });
  expect(response.statusCode).toBe(200);
  return orderListSchema.parse(response.json());
}

const ids = (body: OrderList) => body.items.map((order) => order.id);

// Orders 1 to 4, oldest first: A ordered, B collected, A collected, B cancelled.
async function insertFour() {
  const rows = [
    { n: 1, patientId: PATIENT_A, status: 'ordered' },
    { n: 2, patientId: PATIENT_B, status: 'collected' },
    { n: 3, patientId: PATIENT_A, status: 'collected' },
    { n: 4, patientId: PATIENT_B, status: 'cancelled' },
  ];
  for (const { n, patientId, status } of rows) {
    await insertOrder(t.pool, {
      id: id(n),
      patientId,
      status,
      createdAt: `2026-11-0${n}T16:00:00Z`,
      items: [CBC],
    });
  }
}

describe('GET /api/orders filters', () => {
  it('status alone shows only orders in that status', async () => {
    await insertFour();
    expect(ids(await list('?status=collected'))).toEqual([id(3), id(2)]);
  });

  it('the cancelled status is accepted and returns cancelled rows', async () => {
    await insertFour();
    expect(ids(await list('?status=cancelled'))).toEqual([id(4)]);
  });

  it('patientId alone shows only that patient’s orders', async () => {
    await insertFour();
    expect(ids(await list(`?patientId=${PATIENT_A}`))).toEqual([id(3), id(1)]);
  });

  it('both filters together show only orders matching both', async () => {
    await insertFour();
    expect(ids(await list(`?status=collected&patientId=${PATIENT_B}`))).toEqual(
      [id(2)],
    );
  });

  it('an unknown but well-formed patient id is an empty list, not an error', async () => {
    await insertFour();
    const body = await list('?patientId=99999999-9999-4999-8999-999999999999');
    expect(body.items).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it('an upper-case patient id matches like the lower-case one', async () => {
    await insertFour();
    expect(
      ids(await list(`?patientId=${PATIENT_A.toUpperCase()}`)),
    ).toHaveLength(2);
  });
});

describe('GET /api/orders paging', () => {
  it('orders placed at the same moment come back by id, highest first, on every page', async () => {
    for (let n = 1; n <= 5; n += 1) {
      await insertOrder(t.pool, {
        id: id(n),
        createdAt: '2026-11-10T16:00:00Z',
        items: [CBC],
      });
    }
    const first = await list('?limit=2');
    const second = await list('?limit=2&offset=2');
    const third = await list('?limit=2&offset=4');
    expect(ids(first)).toEqual([id(5), id(4)]);
    expect(ids(second)).toEqual([id(3), id(2)]);
    expect(ids(third)).toEqual([id(1)]);
    expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('two pages have no overlap and no gap', async () => {
    for (let n = 1; n <= 30; n += 1) {
      await insertOrder(t.pool, {
        id: id(n),
        createdAt: `2026-11-10T16:${n.toString().padStart(2, '0')}:00Z`,
        items: [CBC],
      });
    }
    const first = await list();
    expect(first.items).toHaveLength(25);
    expect(first.hasMore).toBe(true);
    const second = await list('?offset=25');
    expect(second.items).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    const all = [...ids(first), ...ids(second)];
    expect(all).toEqual(Array.from({ length: 30 }, (_, i) => id(30 - i)));
  });

  it('exactly limit matching orders has no more', async () => {
    for (let n = 1; n <= 25; n += 1) {
      await insertOrder(t.pool, {
        id: id(n),
        createdAt: `2026-11-10T16:${n.toString().padStart(2, '0')}:00Z`,
        items: [CBC],
      });
    }
    const body = await list();
    expect(body.items).toHaveLength(25);
    expect(body.hasMore).toBe(false);
  });

  it('pages inside a filter, counting only the matching orders', async () => {
    await insertFour();
    const body = await list(`?patientId=${PATIENT_A}&limit=1`);
    expect(ids(body)).toEqual([id(3)]);
    expect(body.hasMore).toBe(true);
  });

  it('accepts the largest limit', async () => {
    expect((await list('?limit=100')).items).toEqual([]);
  });

  it('has no count of all matching orders, and runs one query per request', async () => {
    await insertFour();
    const response = await t.inject({ method: 'GET', url: '/api/orders' });
    expect(Object.keys(response.json()).sort()).toEqual([
      'clinicTimezone',
      'hasMore',
      'items',
    ]);
    const requestId = response.headers['x-request-id'];
    const queries = t
      .logs()
      .filter(
        (line) => line.event === 'db.query' && line.requestId === requestId,
      );
    expect(queries).toHaveLength(1);
  });
});

describe('GET /api/orders refusals', () => {
  it.each([
    ['status=bogus', 'status'],
    ['status=ORDERED', 'status'],
    ['status=ordered&status=collected', 'status'],
    ['patientId=abc', 'patientId'],
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=1.5', 'limit'],
    ['limit=abc', 'limit'],
    ['limit=', 'limit'],
    ['offset=-1', 'offset'],
    ['offset=1.5', 'offset'],
    ['offset=abc', 'offset'],
    ['colour=red', 'colour'],
  ])('%s is a 400 VALIDATION_ERROR naming %s', async (query, field) => {
    const response = await t.inject({
      method: 'GET',
      url: `/api/orders?${query}`,
    });
    expect(response.statusCode).toBe(400);
    const { error } = response.json<{
      error: {
        code: string;
        requestId: string;
        details: { field: string }[];
      };
    }>();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.requestId).toEqual(expect.any(String));
    expect(error.details.map((d) => d.field)).toEqual([field]);
  });
});

describe('GET /api/orders logging', () => {
  it('logs the filter names and the row count, never a value', async () => {
    await insertFour();
    await list(`?status=collected&patientId=${PATIENT_A}`);
    // The capture keeps every test's lines: this test's is the last.
    const line = t.logs().findLast((l) => l.event === 'orders.listed');
    expect(line).toMatchObject({
      filters: ['status', 'patientId'],
      rowCount: 1,
      hasMore: false,
    });
    const text = t.logText();
    expect(text).not.toContain(PATIENT_A);
    expect(text).not.toContain('collected&');
    expect(text).not.toContain('Alpha');
  });
});
