// The orders tables' own rules (migration 0004_orders.sql), tested with direct
// SQL: they must hold for any row, however it is written.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ORDER_STATUSES } from '../../shared/orders';
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
  TEST_CBC,
} from './fixtures';

let t: TestApp;
const ORDER = '40000000-0000-4000-8000-000000000001';

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

function insertItem(values: {
  orderId?: string;
  priceCents?: number;
  turnaroundDays?: number;
}) {
  return t.pool.query(
    `insert into order_items (order_id, lab_test_id, test_code, test_name, price_cents, turnaround_days)
     values ($1, $2, 'CBC', 'Complete Blood Count', $3, $4)`,
    [
      values.orderId ?? ORDER,
      TEST_CBC,
      values.priceCents ?? 2500,
      values.turnaroundDays ?? 1,
    ],
  );
}

async function columns(table: string): Promise<string[]> {
  const { rows } = await t.pool.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [table],
  );
  return rows.map((row) => row.column_name);
}

describe('orders', () => {
  it('has no total column: the total is always derived from the items', async () => {
    expect(await columns('orders')).toEqual([
      'id',
      'patient_id',
      'status',
      'estimated_ready_date',
      'created_at',
      'updated_at',
    ]);
  });

  it('the status CHECK lists exactly ORDER_STATUSES, in the same order', async () => {
    const { rows } = await t.pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition from pg_constraint
       where conname = 'orders_status_known'`,
    );
    const inCheck = [...(rows[0]?.definition ?? '').matchAll(/'([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(inCheck).toEqual([...ORDER_STATUSES]);
  });

  it.each(ORDER_STATUSES)('accepts the status %s', async (status) => {
    await insertOrder(t.pool, {
      id: ORDER,
      createdAt: '2026-11-10T16:00:00Z',
      status,
      items: [],
    });
  });

  it('rejects a status that is not in the list', async () => {
    await expect(
      insertOrder(t.pool, {
        id: ORDER,
        createdAt: '2026-11-10T16:00:00Z',
        status: 'lost',
        items: [],
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'orders_status_known',
    });
  });

  it('defaults the status to ordered', async () => {
    await t.pool.query(
      `insert into orders (id, patient_id, estimated_ready_date) values ($1, $2, '2026-11-20')`,
      [ORDER, PATIENT_A],
    );
    const { rows } = await t.pool.query('select status from orders');
    expect(rows).toEqual([{ status: 'ordered' }]);
  });

  it('requires a ready date and an existing patient', async () => {
    await expect(
      t.pool.query(`insert into orders (id, patient_id) values ($1, $2)`, [
        ORDER,
        PATIENT_A,
      ]),
    ).rejects.toMatchObject({ code: '23502', column: 'estimated_ready_date' });
    await expect(
      t.pool.query(
        `insert into orders (id, patient_id, estimated_ready_date) values ($1, $2, '2026-11-20')`,
        [ORDER, '20000000-0000-4000-8000-0000000000ff'],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('order_items', () => {
  beforeEach(async () => {
    await insertOrder(t.pool, {
      id: ORDER,
      createdAt: '2026-11-10T16:00:00Z',
      items: [],
    });
  });

  it('holds its own copy of the test: code, name, price and turnaround', async () => {
    expect(await columns('order_items')).toEqual([
      'order_id',
      'lab_test_id',
      'test_code',
      'test_name',
      'price_cents',
      'turnaround_days',
    ]);
  });

  it('accepts a price of 0 and a turnaround of 1', async () => {
    await insertItem({ priceCents: 0, turnaroundDays: 1 });
  });

  it('rejects a negative price', async () => {
    await expect(insertItem({ priceCents: -1 })).rejects.toMatchObject({
      code: '23514',
      constraint: 'order_items_price_cents_not_negative',
    });
  });

  it('rejects a turnaround of 0', async () => {
    await expect(insertItem({ turnaroundDays: 0 })).rejects.toMatchObject({
      code: '23514',
      constraint: 'order_items_turnaround_days_positive',
    });
  });

  it('rejects the same test twice on one order', async () => {
    await insertItem({});
    await expect(insertItem({ priceCents: 100 })).rejects.toMatchObject({
      code: '23505',
      constraint: 'order_items_pkey',
    });
  });

  it('allows the same test on two different orders', async () => {
    await insertOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000002',
      createdAt: '2026-11-11T16:00:00Z',
      items: [CBC],
    });
    await insertItem({});
  });

  it('rejects an item for an order or a test that does not exist', async () => {
    await expect(
      insertItem({ orderId: '40000000-0000-4000-8000-0000000000ff' }),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      t.pool.query(
        `insert into order_items (order_id, lab_test_id, test_code, test_name, price_cents, turnaround_days)
         values ($1, '30000000-0000-4000-8000-0000000000ff', 'X', 'X', 1, 1)`,
        [ORDER],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('keeps an order and its items: an ordered test cannot be deleted from the catalog', async () => {
    await insertItem({});
    await expect(
      t.pool.query('delete from lab_tests where id = $1', [TEST_CBC]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      t.pool.query('delete from patients where id = $1', [PATIENT_A]),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
