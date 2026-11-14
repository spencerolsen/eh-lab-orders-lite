// POST /api/orders/:id/transitions through the app, on the test database
// (LAB-16): the three refusals (404, 422, 409) and the 400s, the conditional
// update, two requests at once, and the log lines.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { errorBodySchema } from '../../shared/api-error';
import { orderDetailSchema } from '../../shared/orders';
import { withQueryLog } from '../db/query';
import {
  captureLogger,
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import { CBC, insertCatalogAndPatients, insertOrder } from './fixtures';
import { updateOrderStatus } from './repo';

let t: TestApp;
// Where this test's log lines start: one app serves the whole file.
let logStart = 0;

const ORDER_ID = '40000000-0000-4000-8000-000000000001';
const MISSING_ID = '40000000-0000-4000-8000-0000000000ff';
const CREATED_AT = '2026-10-30T18:00:00Z';

beforeAll(() => {
  t = startTestApp();
});

beforeEach(async () => {
  await truncateAllTables(t.pool);
  await insertCatalogAndPatients(t.pool);
  logStart = t.logs().length;
});

afterAll(async () => {
  await t.close();
});

async function givenOrder(status = 'ordered'): Promise<void> {
  await insertOrder(t.pool, {
    id: ORDER_ID,
    createdAt: CREATED_AT,
    status,
    readyDate: '2026-11-03',
    items: [CBC],
  });
}

function move(to: unknown, id = ORDER_ID) {
  return t.inject({
    method: 'POST',
    url: `/api/orders/${id}/transitions`,
    payload: to === undefined ? {} : { to },
  });
}

async function stored(): Promise<{
  status: string;
  updated_at: Date;
  estimated_ready_date: string;
}> {
  const { rows } = await t.pool.query<{
    status: string;
    updated_at: Date;
    estimated_ready_date: string;
  }>(
    'select status, updated_at, estimated_ready_date from orders where id = $1',
    [ORDER_ID],
  );
  return rows[0]!;
}

function errorOf(response: { json: () => unknown }) {
  return errorBodySchema.parse(response.json()).error;
}

function event(name: string) {
  return t
    .logs()
    .slice(logStart)
    .filter((line) => line.event === name);
}

describe('POST /api/orders/:id/transitions: allowed moves', () => {
  it('moves ordered to collected to completed, returning the order as GET does', async () => {
    await givenOrder('ordered');

    const collected = await move('collected');
    expect(collected.statusCode).toBe(200);
    const afterCollect = orderDetailSchema.parse(collected.json());
    expect(afterCollect).toMatchObject({
      id: ORDER_ID,
      status: 'collected',
      allowedNextStatuses: ['completed'],
      canCancel: true,
    });
    // The same body GET /api/orders/:id returns now.
    const get = await t.inject({
      method: 'GET',
      url: `/api/orders/${ORDER_ID}`,
    });
    expect(afterCollect).toEqual(get.json());

    const completed = await move('completed');
    expect(completed.statusCode).toBe(200);
    expect(orderDetailSchema.parse(completed.json())).toMatchObject({
      status: 'completed',
      allowedNextStatuses: [],
      canCancel: false,
    });
    expect((await stored()).status).toBe('completed');
  });

  it('sets updated_at and leaves the stored ready date alone', async () => {
    await givenOrder('ordered');
    const before = await stored();
    expect(before.updated_at.toISOString()).toBe('2026-10-30T18:00:00.000Z');

    expect((await move('collected')).statusCode).toBe(200);

    const after = await stored();
    expect(after.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
    expect(after.estimated_ready_date).toBe('2026-11-03');
  });
});

describe('POST /api/orders/:id/transitions: refusals', () => {
  // The conditional update alone would let this through: the order IS still
  // at the status just read. Only the domain check refuses it.
  it('refuses a skip (ordered to completed) with 422 ILLEGAL_TRANSITION', async () => {
    await givenOrder('ordered');
    const before = await stored();

    const response = await move('completed');

    expect(response.statusCode).toBe(422);
    expect(errorOf(response)).toMatchObject({
      code: 'ILLEGAL_TRANSITION',
      message: 'An order cannot move from ordered to completed',
    });
    expect(await stored()).toEqual(before);
  });

  // completed and cancelled are both final.
  it.each([
    { from: 'completed', to: 'collected' },
    { from: 'completed', to: 'completed' },
    { from: 'cancelled', to: 'collected' },
    { from: 'cancelled', to: 'completed' },
  ])(
    'refuses $to from a $from order with 422 ILLEGAL_TRANSITION',
    async ({ from, to }) => {
      await givenOrder(from);
      const before = await stored();

      const response = await move(to);

      expect(response.statusCode).toBe(422);
      expect(errorOf(response).code).toBe('ILLEGAL_TRANSITION');
      expect(errorOf(response).message).toBe(
        `An order cannot move from ${from} to ${to}`,
      );
      expect(await stored()).toEqual(before);
    },
  );

  it('refuses going back (collected to collected is no move either)', async () => {
    await givenOrder('collected');
    const response = await move('collected');
    expect(response.statusCode).toBe(422);
    expect(errorOf(response).code).toBe('ILLEGAL_TRANSITION');
  });

  it('answers 404 NOT_FOUND for an order that does not exist', async () => {
    const response = await move('collected', MISSING_ID);
    expect(response.statusCode).toBe(404);
    expect(errorOf(response).code).toBe('NOT_FOUND');
  });

  it.each([
    { name: 'a missing to', payload: {} },
    { name: 'to: "cancelled"', payload: { to: 'cancelled' } },
    { name: 'to: "ordered"', payload: { to: 'ordered' } },
    { name: 'an unknown to', payload: { to: 'shipped' } },
    { name: 'a to that is not a string', payload: { to: 2 } },
    { name: 'an unknown extra field', payload: { to: 'collected', by: 'x' } },
  ])('answers 400 VALIDATION_ERROR for $name', async ({ payload }) => {
    await givenOrder('ordered');
    const response = await t.inject({
      method: 'POST',
      url: `/api/orders/${ORDER_ID}/transitions`,
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
    expect((await stored()).status).toBe('ordered');
  });

  it('answers 400 VALIDATION_ERROR for an id that is not a uuid', async () => {
    const response = await move('collected', 'not-a-uuid');
    expect(response.statusCode).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
  });
});

describe('the conditional update', () => {
  // Someone else moved the order after this caller read it as 'ordered': the
  // update with the stale status matches no row and overwrites nothing.
  it('changes no row when the order is no longer at the status read', async () => {
    await givenOrder('collected');
    const db = withQueryLog(t.pool, captureLogger().logger);

    const updated = await updateOrderStatus(
      db,
      ORDER_ID,
      'ordered',
      'collected',
    );

    expect(updated).toBe(false);
    const after = await stored();
    expect(after.status).toBe('collected');
    expect(after.updated_at.toISOString()).toBe('2026-10-30T18:00:00.000Z');
  });

  it('changes the row when the order is still at the status read', async () => {
    await givenOrder('ordered');
    const db = withQueryLog(t.pool, captureLogger().logger);
    expect(await updateOrderStatus(db, ORDER_ID, 'ordered', 'collected')).toBe(
      true,
    );
    expect((await stored()).status).toBe('collected');
  });
});

// Waits until `count` updates of orders are blocked by the table lock.
async function waitForBlockedUpdates(count: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await t.pool.query<{ n: number }>(
      `select count(*)::int as n from pg_locks
       where relation = 'orders'::regclass and not granted`,
    );
    if (rows[0]?.n === count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${count} updates never waited for the table lock`);
}

describe('two requests for the same move at once', () => {
  it('lets exactly one win; the other gets 409 ORDER_CHANGED', async () => {
    await givenOrder('ordered');
    // Force the two requests to overlap. A share lock on the table, held by a
    // separate connection, lets the reads through but makes every update
    // wait. Once both updates are waiting, both requests have read the order
    // as 'ordered' and passed the check; releasing the lock lets them race.
    // Without the status condition both updates would succeed (two 200s).
    const locker = await t.pool.connect();
    let responses;
    try {
      await locker.query('begin');
      await locker.query('lock table orders in share mode');
      const both = Promise.all([move('collected'), move('collected')]);
      await waitForBlockedUpdates(2);
      await locker.query('commit');
      responses = await both;
    } finally {
      locker.release();
    }

    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const lost = responses.find((r) => r.statusCode === 409)!;
    expect(errorOf(lost)).toMatchObject({
      code: 'ORDER_CHANGED',
      message: 'This order was changed by someone else',
    });
    expect((await stored()).status).toBe('collected');
    // The row changed once: one change logged, one lost race.
    expect(event('order.status_changed')).toHaveLength(1);
    expect(event('order.transition_lost_race')).toEqual([
      expect.objectContaining({
        level: 'warn',
        code: 'ORDER_CHANGED',
        orderId: ORDER_ID,
        expected: 'ordered',
        to: 'collected',
      }),
    ]);
  });
});

describe('logs', () => {
  it('logs a change once at info with the id and both statuses', async () => {
    await givenOrder('ordered');
    const response = await move('collected');
    const requestId = response.headers['x-request-id'];

    const lines = event('order.status_changed');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      requestId,
      orderId: ORDER_ID,
      from: 'ordered',
      to: 'collected',
    });
    expect(event('order.transition_refused')).toHaveLength(0);
    expect(event('order.transition_lost_race')).toHaveLength(0);
  });

  it('logs an illegal move at warn with its code, and no change', async () => {
    await givenOrder('ordered');
    await move('completed');

    expect(event('order.transition_refused')).toEqual([
      expect.objectContaining({
        level: 'warn',
        code: 'ILLEGAL_TRANSITION',
        orderId: ORDER_ID,
        from: 'ordered',
        to: 'completed',
      }),
    ]);
    expect(event('order.status_changed')).toHaveLength(0);
    expect(event('order.transition_lost_race')).toHaveLength(0);
  });

  it('writes no patient detail on any line', async () => {
    await givenOrder('ordered');
    await move('collected');
    await move('collected'); // 422: already collected
    await move('collected', MISSING_ID);
    const text = t.logText();
    // The fixture patient (insertCatalogAndPatients): names, date of birth,
    // email.
    for (const detail of [
      'Alpha',
      'Fixture',
      '1984-03-09',
      'alpha@example.test',
    ]) {
      expect(text).not.toContain(detail);
    }
  });
});
