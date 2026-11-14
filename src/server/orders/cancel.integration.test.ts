// POST /api/orders/:id/cancel through the app, on the test database
// (LAB-17): cancelling from ordered and collected, the refusals (404, 422,
// 409, 400), what is stored and returned, the list filter, two cancels at
// once, and the log lines.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { errorBodySchema } from '../../shared/api-error';
import { orderDetailSchema, orderListSchema } from '../../shared/orders';
import { withQueryLog } from '../db/query';
import {
  captureLogger,
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import {
  CBC,
  FIXTURE_CANCELLATION,
  insertCatalogAndPatients,
  insertOrder,
  LIPID,
} from './fixtures';
import { updateOrderStatusAndCancellation } from './repo';

let t: TestApp;
// Where this test's log lines start: one app serves the whole file.
let logStart = 0;

const ORDER_ID = '40000000-0000-4000-8000-000000000001';
const MISSING_ID = '40000000-0000-4000-8000-0000000000ff';
const CREATED_AT = '2026-10-30T18:00:00Z';
const NOTE = 'Patient asked to reschedule';
const NAME = 'Sample Staff';

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
    items: [CBC, LIPID],
  });
}

function cancel(payload: unknown, id = ORDER_ID) {
  return t.inject({
    method: 'POST',
    url: `/api/orders/${id}/cancel`,
    payload: payload as Record<string, unknown>,
  });
}

type StoredOrder = {
  status: string;
  updated_at: Date;
  estimated_ready_date: string;
  cancellation_note: string | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
};

async function stored(): Promise<StoredOrder> {
  const { rows } = await t.pool.query<StoredOrder>(
    `select status, updated_at, estimated_ready_date,
            cancellation_note, cancelled_by, cancelled_at
     from orders where id = $1`,
    [ORDER_ID],
  );
  return rows[0]!;
}

async function storedItems(): Promise<unknown[]> {
  const { rows } = await t.pool.query(
    'select * from order_items where order_id = $1 order by lab_test_id',
    [ORDER_ID],
  );
  return rows;
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

describe('POST /api/orders/:id/cancel: allowed', () => {
  it.each(['ordered', 'collected'])(
    'cancels a %s order and returns it as GET does',
    async (from) => {
      await givenOrder(from);
      const itemsBefore = await storedItems();

      const response = await cancel({ note: NOTE, cancelledBy: NAME });

      expect(response.statusCode).toBe(200);
      const order = orderDetailSchema.parse(response.json());
      expect(order).toMatchObject({
        id: ORDER_ID,
        status: 'cancelled',
        allowedNextStatuses: [],
        canCancel: false,
        cancellation: { note: NOTE, cancelledBy: NAME },
      });
      // The same body GET /api/orders/:id returns now.
      const get = await t.inject({
        method: 'GET',
        url: `/api/orders/${ORDER_ID}`,
      });
      expect(order).toEqual(get.json());
      // Kept, with its items and prices as they were.
      expect(await storedItems()).toEqual(itemsBefore);
      expect(order.totalCents).toBe(CBC.priceCents + LIPID.priceCents);
    },
  );

  it('stores the trimmed note, the name and the time, and returns them', async () => {
    await givenOrder('collected');
    const before = await stored();
    expect(before).toMatchObject({
      cancellation_note: null,
      cancelled_by: null,
      cancelled_at: null,
    });

    const response = await cancel({
      note: `  ${NOTE}  `,
      cancelledBy: ` ${NAME}\n`,
    });

    const after = await stored();
    expect(after).toMatchObject({
      status: 'cancelled',
      cancellation_note: NOTE,
      cancelled_by: NAME,
      estimated_ready_date: '2026-11-03',
    });
    expect(after.cancelled_at).not.toBeNull();
    expect(after.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
    // Set in the same statement, so the two times are the same.
    expect(after.cancelled_at?.getTime()).toBe(after.updated_at.getTime());
    const { cancellation } = orderDetailSchema.parse(response.json());
    expect(cancellation).toEqual({
      note: NOTE,
      cancelledBy: NAME,
      cancelledAt: after.cancelled_at?.toISOString(),
      // The same moment on the clinic's clock (America/Denver in tests).
      cancelledAtClinic: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
      ) as string,
    });
  });

  it('shows the cancelled order when the list is filtered by cancelled', async () => {
    await givenOrder('ordered');
    expect((await cancel({ note: NOTE, cancelledBy: NAME })).statusCode).toBe(
      200,
    );

    const response = await t.inject({
      method: 'GET',
      url: '/api/orders?status=cancelled',
    });
    const { items } = orderListSchema.parse(response.json());
    expect(items).toEqual([
      expect.objectContaining({
        id: ORDER_ID,
        status: 'cancelled',
        testCount: 2,
        totalCents: CBC.priceCents + LIPID.priceCents,
      }),
    ]);
  });

  it('answers cancellation: null on an order that is not cancelled', async () => {
    await givenOrder('ordered');
    const response = await t.inject({
      method: 'GET',
      url: `/api/orders/${ORDER_ID}`,
    });
    expect(orderDetailSchema.parse(response.json()).cancellation).toBeNull();
  });
});

describe('POST /api/orders/:id/cancel: refusals', () => {
  // The conditional update alone would let these through: the order IS
  // still at the status just read. Only the transition table refuses them.
  it.each(['completed', 'cancelled'])(
    'refuses a %s order with 422 ILLEGAL_TRANSITION and changes nothing',
    async (from) => {
      await givenOrder(from);
      const before = await stored();

      const response = await cancel({ note: NOTE, cancelledBy: NAME });

      expect(response.statusCode).toBe(422);
      expect(errorOf(response)).toMatchObject({
        code: 'ILLEGAL_TRANSITION',
        message: `An order cannot move from ${from} to cancelled`,
      });
      expect(await stored()).toEqual(before);
    },
  );

  it('keeps the first cancellation when an already cancelled order is cancelled again', async () => {
    await givenOrder('cancelled');
    await cancel({ note: NOTE, cancelledBy: NAME });
    expect(await stored()).toMatchObject({
      cancellation_note: FIXTURE_CANCELLATION.note,
      cancelled_by: FIXTURE_CANCELLATION.cancelledBy,
    });
  });

  it('answers 404 NOT_FOUND for an order that does not exist', async () => {
    const response = await cancel(
      { note: NOTE, cancelledBy: NAME },
      MISSING_ID,
    );
    expect(response.statusCode).toBe(404);
    expect(errorOf(response).code).toBe('NOT_FOUND');
  });

  it.each([
    { name: 'a missing note', payload: { cancelledBy: NAME }, field: 'note' },
    { name: 'a missing name', payload: { note: NOTE }, field: 'cancelledBy' },
    {
      name: 'a blank note',
      payload: { note: '   ', cancelledBy: NAME },
      field: 'note',
    },
    {
      name: 'a blank name',
      payload: { note: NOTE, cancelledBy: ' \t ' },
      field: 'cancelledBy',
    },
    {
      name: 'a 501-character note',
      payload: { note: 'n'.repeat(501), cancelledBy: NAME },
      field: 'note',
    },
    {
      name: 'a 101-character name',
      payload: { note: NOTE, cancelledBy: 'b'.repeat(101) },
      field: 'cancelledBy',
    },
    {
      name: 'a note that is not text',
      payload: { note: 7, cancelledBy: NAME },
      field: 'note',
    },
    {
      name: 'an unknown extra field',
      payload: { note: NOTE, cancelledBy: NAME, at: 'now' },
      field: undefined,
    },
  ])(
    'answers 400 VALIDATION_ERROR for $name, and the order is unchanged',
    async ({ payload, field }) => {
      await givenOrder('ordered');
      const before = await stored();

      const response = await cancel(payload);

      expect(response.statusCode).toBe(400);
      const error = errorOf(response);
      expect(error.code).toBe('VALIDATION_ERROR');
      if (field !== undefined) {
        expect(error.details?.map((detail) => detail.field)).toEqual([field]);
      }
      expect(await stored()).toEqual(before);
    },
  );

  it('accepts a 500-character note and a 100-character name', async () => {
    await givenOrder('ordered');
    const response = await cancel({
      note: 'n'.repeat(500),
      cancelledBy: 'b'.repeat(100),
    });
    expect(response.statusCode).toBe(200);
  });

  it('answers 400 VALIDATION_ERROR for an id that is not a uuid', async () => {
    const response = await cancel(
      { note: NOTE, cancelledBy: NAME },
      'not-a-uuid',
    );
    expect(response.statusCode).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
  });

  // Cancelling stays on its own endpoint (LAB-16 keeps refusing it).
  it('is still refused by the transitions endpoint', async () => {
    await givenOrder('ordered');
    const response = await t.inject({
      method: 'POST',
      url: `/api/orders/${ORDER_ID}/transitions`,
      payload: { to: 'cancelled' },
    });
    expect(response.statusCode).toBe(400);
    expect((await stored()).status).toBe('ordered');
  });
});

describe('the conditional cancel update', () => {
  // Someone else moved the order after this caller read it as 'ordered': the
  // update with the stale status matches no row and overwrites nothing.
  it('changes no row when the order is no longer at the status read', async () => {
    await givenOrder('collected');
    const before = await stored();
    const db = withQueryLog(t.pool, captureLogger().logger);

    const updated = await updateOrderStatusAndCancellation(
      db,
      ORDER_ID,
      'ordered',
      'cancelled',
      { note: NOTE, cancelledBy: NAME },
    );

    expect(updated).toBe(false);
    expect(await stored()).toEqual(before);
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

// Runs the requests with their reads and updates forced to overlap: a share
// lock on the table, held by a separate connection, lets the reads through
// but makes every update wait. Once all the updates are waiting, every
// request has read the order and passed the check; releasing the lock lets
// them race. Without the status condition every update would succeed.
async function overlapping<T>(requests: (() => Promise<T>)[]): Promise<T[]> {
  const locker = await t.pool.connect();
  try {
    await locker.query('begin');
    await locker.query('lock table orders in share mode');
    const all = Promise.all(requests.map((request) => request()));
    await waitForBlockedUpdates(requests.length);
    await locker.query('commit');
    return await all;
  } finally {
    locker.release();
  }
}

describe('changed by someone else before the cancel landed', () => {
  it('lets one of two cancels win; the other gets 409 and overwrites nothing', async () => {
    await givenOrder('ordered');

    const responses = await overlapping([
      () => cancel({ note: 'First note', cancelledBy: 'First Staff' }),
      () => cancel({ note: 'Second note', cancelledBy: 'Second Staff' }),
    ]);

    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const won = responses.find((r) => r.statusCode === 200)!;
    const lost = responses.find((r) => r.statusCode === 409)!;
    expect(errorOf(lost)).toMatchObject({
      code: 'ORDER_CHANGED',
      message: 'This order was changed by someone else',
    });
    // The stored note and name are the winner's, not overwritten.
    const { cancellation } = orderDetailSchema.parse(won.json());
    expect(await stored()).toMatchObject({
      status: 'cancelled',
      cancellation_note: cancellation?.note,
      cancelled_by: cancellation?.cancelledBy,
    });
    expect(event('order.cancelled')).toHaveLength(1);
    expect(event('order.cancel_lost_race')).toEqual([
      expect.objectContaining({
        level: 'warn',
        code: 'ORDER_CHANGED',
        orderId: ORDER_ID,
        expected: 'ordered',
        to: 'cancelled',
      }),
    ]);
  });

  it('answers 409 to a cancel that loses to a status change', async () => {
    await givenOrder('ordered');

    const [moved, cancelled] = await overlapping([
      () =>
        t.inject({
          method: 'POST',
          url: `/api/orders/${ORDER_ID}/transitions`,
          payload: { to: 'collected' },
        }),
      () => cancel({ note: NOTE, cancelledBy: NAME }),
    ]);

    // One wins, whichever Postgres lets through first; the other is a 409.
    expect([moved!.statusCode, cancelled!.statusCode].sort()).toEqual([
      200, 409,
    ]);
    const after = await stored();
    if (moved!.statusCode === 200) {
      expect(after).toMatchObject({
        status: 'collected',
        cancellation_note: null,
        cancelled_by: null,
        cancelled_at: null,
      });
    } else {
      expect(after).toMatchObject({ status: 'cancelled' });
    }
  });
});

describe('logs', () => {
  it('logs a cancel once at info with the id and the status it left, and no note or name', async () => {
    await givenOrder('collected');
    const response = await cancel({ note: NOTE, cancelledBy: NAME });
    const requestId = response.headers['x-request-id'];

    const lines = event('order.cancelled');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      requestId,
      orderId: ORDER_ID,
      from: 'collected',
    });
    expect(event('order.cancel_refused')).toHaveLength(0);
    expect(event('order.cancel_lost_race')).toHaveLength(0);
  });

  it('logs a refused cancel at warn with its code and both statuses', async () => {
    await givenOrder('completed');
    await cancel({ note: NOTE, cancelledBy: NAME });

    expect(event('order.cancel_refused')).toEqual([
      expect.objectContaining({
        level: 'warn',
        code: 'ILLEGAL_TRANSITION',
        orderId: ORDER_ID,
        from: 'completed',
        to: 'cancelled',
      }),
    ]);
    expect(event('order.cancelled')).toHaveLength(0);
  });

  it('writes no note, name or patient detail on any line', async () => {
    await givenOrder('ordered');
    await cancel({ note: NOTE, cancelledBy: NAME }); // 200
    await cancel({ note: NOTE, cancelledBy: NAME }); // 422: already cancelled
    await cancel({ note: NOTE, cancelledBy: 'b'.repeat(101) }); // 400
    await cancel({ note: NOTE, cancelledBy: NAME }, MISSING_ID); // 404
    const text = t.logText();
    for (const detail of [
      'reschedule',
      'Sample Staff',
      'bbbbbbbbbb',
      // The fixture patient (insertCatalogAndPatients).
      'Alpha',
      'Fixture',
      '1984-03-09',
      'alpha@example.test',
    ]) {
      expect(text).not.toContain(detail);
    }
  });
});
