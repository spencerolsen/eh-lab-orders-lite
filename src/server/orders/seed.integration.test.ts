// The orders seed (db/seeds/orders.ts) on the test database: run twice, its
// rows built through estimateReadyDate and copied from the catalog.
import { afterAll, beforeAll, expect, it } from 'vitest';
import type pg from 'pg';

import { seedLabTests } from '../../../db/seeds/lab-tests';
import { SEED_ORDERS, seedOrders } from '../../../db/seeds/orders';
import { seedPatients } from '../../../db/seeds/patients';
import { orderListSchema } from '../../shared/orders';
import {
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import { estimateReadyDate } from './domain/ready-date';

let t: TestApp;
let first: { orders: unknown[]; items: unknown[] };
const options = { clinicTimezone: 'America/Denver' };

async function read(client: pg.ClientBase | pg.Pool) {
  const orders = (
    await client.query(
      `select id, patient_id, status, estimated_ready_date, created_at, updated_at
       from orders order by id`,
    )
  ).rows;
  const items = (
    await client.query(
      'select * from order_items order by order_id, lab_test_id',
    )
  ).rows;
  return { orders, items };
}

beforeAll(async () => {
  t = startTestApp();
  await truncateAllTables(t.pool);
  const client = await t.pool.connect();
  try {
    await seedLabTests(client);
    await seedPatients(client);
    // 4 orders with 1 + 3 + 2 + 3 items.
    expect(await seedOrders(client, options)).toBe(13);
    first = await read(client);
    expect(await seedOrders(client, options)).toBe(0);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await t.close();
});

it('seeding twice leaves the same 4 orders and the same items', async () => {
  expect(await read(t.pool)).toEqual(first);
  expect(first.orders.map((order) => (order as { id: string }).id)).toEqual(
    SEED_ORDERS.map((order) => order.id),
  );
  expect(first.items).toHaveLength(9);
});

it('copies every item from the catalog row of its test', async () => {
  const { rows } = await t.pool.query<{ mismatches: number }>(
    `select count(*)::int as mismatches
     from order_items i join lab_tests t on t.id = i.lab_test_id
     where (i.test_code, i.test_name, i.price_cents, i.turnaround_days)
       is distinct from (t.code, t.name, t.price_cents, t.turnaround_days)`,
  );
  expect(rows[0]?.mismatches).toBe(0);
});

it('stores the ready date estimateReadyDate gives for the order time and its items', async () => {
  const { rows } = await t.pool.query<{
    id: string;
    created_at: Date;
    estimated_ready_date: string;
    turnarounds: number[];
  }>(
    `select o.id, o.created_at, o.estimated_ready_date,
            array_agg(i.turnaround_days) as turnarounds
     from orders o join order_items i on i.order_id = o.id
     group by o.id order by o.id`,
  );
  for (const row of rows) {
    const expected = estimateReadyDate(
      row.created_at,
      row.turnarounds.map((turnaroundDays) => ({ turnaroundDays })),
      'America/Denver',
    );
    expect(row.estimated_ready_date, row.id).toBe(expected);
  }
  // The same dates written out, so a change to the rule shows here too.
  expect(rows.map((row) => row.estimated_ready_date)).toEqual([
    '2026-11-13', // Saturday 11-07, CULT (5): Monday 11-09 is day 1
    '2026-11-09', // Wednesday 11-04, longest 3 (VITD)
    '2026-11-03', // Friday 10-30, longest 2 (LIPID)
    '2026-10-28', // Monday 10-26, longest 2
  ]);
});

it('lists the seeded orders newest first, with their totals and statuses', async () => {
  const response = await t.inject({ method: 'GET', url: '/api/orders' });
  const { items } = orderListSchema.parse(response.json());
  expect(
    items.map((order) => [
      order.id.slice(-1),
      order.status,
      order.testCount,
      order.totalCents,
      order.createdAtClinic,
    ]),
  ).toEqual([
    ['1', 'ordered', 1, 5250, '2026-11-07 11:00'],
    ['2', 'collected', 3, 13200, '2026-11-04 14:30'],
    ['3', 'ordered', 2, 5600, '2026-10-30 12:00'],
    ['4', 'completed', 3, 12250, '2026-10-26 10:00'],
  ]);
});
