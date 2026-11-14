// GET /api/orders through the app, on the test database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { orderListSchema, type OrderList } from '../../shared/orders';
import {
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import {
  CBC,
  CULT,
  insertCatalogAndPatients,
  insertOrder,
  LIPID,
  PATIENT_A,
  PATIENT_B,
  TEST_CBC,
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

async function list(): Promise<OrderList> {
  const response = await t.inject({ method: 'GET', url: '/api/orders' });
  expect(response.statusCode).toBe(200);
  return orderListSchema.parse(response.json());
}

describe('GET /api/orders', () => {
  it('returns an empty list with hasMore false and the clinic time zone', async () => {
    const response = await t.inject({ method: 'GET', url: '/api/orders' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [],
      hasMore: false,
      clinicTimezone: 'America/Denver',
    });
  });

  it('returns every field of a row', async () => {
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000001',
      patientId: PATIENT_B,
      createdAt: '2026-10-30T18:00:00Z',
      status: 'collected',
      readyDate: '2026-11-03',
      items: [LIPID, CBC],
    });
    const response = await t.inject({ method: 'GET', url: '/api/orders' });
    expect(response.json<OrderList>().items).toEqual([
      {
        id: '40000000-0000-4000-8000-000000000001',
        status: 'collected',
        patient: {
          id: PATIENT_B,
          firstName: 'Beta',
          lastName: 'Fixture',
          dateOfBirth: '1990-12-31',
        },
        testCount: 2,
        totalCents: 6300,
        estimatedReadyDate: '2026-11-03',
        createdAt: '2026-10-30T18:00:00.000Z',
        createdAtClinic: '2026-10-30 12:00',
      },
    ]);
  });

  it('lists newest first, and orders placed at the same moment by id, highest first', async () => {
    const sameMoment = '2026-11-10T16:00:00Z';
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-00000000000a',
      createdAt: sameMoment,
      items: [CBC],
    });
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000001',
      createdAt: '2026-11-12T16:00:00Z',
      items: [CBC],
    });
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-00000000000c',
      createdAt: sameMoment,
      items: [CBC],
    });
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000002',
      createdAt: '2026-11-01T16:00:00Z',
      items: [CBC],
    });
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-00000000000b',
      createdAt: sameMoment,
      items: [CBC],
    });
    expect((await list()).items.map((order) => order.id)).toEqual([
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-00000000000c',
      '40000000-0000-4000-8000-00000000000b',
      '40000000-0000-4000-8000-00000000000a',
      '40000000-0000-4000-8000-000000000002',
    ]);
  });

  it('gives each order the sum of its own items and their count', async () => {
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000001',
      createdAt: '2026-11-10T16:00:00Z',
      items: [CBC],
    });
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000002',
      createdAt: '2026-11-11T16:00:00Z',
      items: [CBC, LIPID, CULT],
    });
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000003',
      patientId: PATIENT_B,
      createdAt: '2026-11-12T16:00:00Z',
      items: [{ ...LIPID, priceCents: 0 }],
    });
    const rows = (await list()).items.map((order) => [
      order.id.slice(-1),
      order.testCount,
      order.totalCents,
    ]);
    expect(rows).toEqual([
      ['3', 1, 0],
      ['2', 3, 11550],
      ['1', 1, 2500],
    ]);
  });

  it('shows an order with no items as 0 tests and $0 rather than hiding it', async () => {
    // No code path stores such an order (LAB-12 refuses an empty test list);
    // the list still shows it if one is written by hand.
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000001',
      createdAt: '2026-11-10T16:00:00Z',
      items: [],
    });
    const [order] = (await list()).items;
    expect([order?.testCount, order?.totalCents]).toEqual([0, 0]);
  });

  it('uses the items frozen when the order was placed, even after the test is edited and deactivated', async () => {
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000001',
      createdAt: '2026-11-10T16:00:00Z',
      items: [CBC],
    });
    await t.pool.query(
      `update lab_tests set price_cents = 9999, turnaround_days = 9,
         code = 'CBC2', name = 'Renamed', is_active = false where id = $1`,
      [TEST_CBC],
    );
    const [order] = (await list()).items;
    expect([order?.testCount, order?.totalCents]).toEqual([1, 2500]);
    const { rows } = await t.pool.query(
      'select test_code, price_cents, turnaround_days from order_items',
    );
    expect(rows).toEqual([
      { test_code: 'CBC', price_cents: 2500, turnaround_days: 1 },
    ]);
  });

  it('gives the created time on the clinic’s wall clock, even when UTC is already the next day', async () => {
    // 06:30 UTC on Saturday is 11:30 pm on Friday in Denver.
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000001',
      createdAt: '2026-11-14T06:30:00Z',
      items: [CBC],
    });
    const body = await list();
    expect(body.clinicTimezone).toBe('America/Denver');
    expect(body.items[0]?.createdAt).toBe('2026-11-14T06:30:00.000Z');
    expect(body.items[0]?.createdAtClinic).toBe('2026-11-13 23:30');
  });

  it('runs one query for the whole list, however many orders there are', async () => {
    for (let n = 1; n <= 5; n += 1) {
      await insertOrder(t.pool, {
        id: `40000000-0000-4000-8000-00000000000${n}`,
        createdAt: `2026-11-1${n}T16:00:00Z`,
        items: [CBC, LIPID],
      });
    }
    const response = await t.inject({ method: 'GET', url: '/api/orders' });
    expect(response.json<OrderList>().items).toHaveLength(5);
    const requestId = response.headers['x-request-id'];
    const queries = t
      .logs()
      .filter(
        (line) => line.event === 'db.query' && line.requestId === requestId,
      );
    expect(queries).toHaveLength(1);
  });

  it('logs no patient name or date of birth', async () => {
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000001',
      patientId: PATIENT_A,
      createdAt: '2026-11-10T16:00:00Z',
      items: [CBC],
    });
    await list();
    const text = t.logText();
    for (const value of [
      'Alpha',
      'Fixture',
      '1984-03-09',
      'alpha@example.test',
    ]) {
      expect(text).not.toContain(value);
    }
    expect(t.logs().some((line) => line.event === 'request.completed')).toBe(
      true,
    );
  });
});
