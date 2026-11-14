// POST /api/orders with an Idempotency-Key (LAB-18), on the test database:
// a repeat of the same key returns the first order and creates nothing, even
// when the two requests arrive at the same moment.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { errorBodySchema } from '../../shared/api-error';
import { orderListItemSchema } from '../../shared/orders';
import {
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import {
  insertCatalogAndPatients,
  PATIENT_A,
  PATIENT_B,
  TEST_CBC,
  TEST_LIPID,
} from './fixtures';

const KEY = '50000000-0000-4000-8000-000000000001';
const OTHER_KEY = '50000000-0000-4000-8000-000000000002';
const BODY = { patientId: PATIENT_A, labTestIds: [TEST_CBC, TEST_LIPID] };

let t: TestApp;
// Where this test's log lines start: one app serves the whole file.
let logStart = 0;

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

function post(body: object, key?: string) {
  return t.inject({
    method: 'POST',
    url: '/api/orders',
    payload: body,
    headers: key === undefined ? {} : { 'idempotency-key': key },
  });
}

const orderIdOf = (response: Awaited<ReturnType<typeof post>>) =>
  orderListItemSchema.parse(response.json()).id;

async function counts(): Promise<{ orders: number; items: number }> {
  const { rows } = await t.pool.query<{ orders: number; items: number }>(
    `select (select count(*)::int from orders) as orders,
            (select count(*)::int from order_items) as items`,
  );
  return rows[0]!;
}

const event = (name: string) =>
  t
    .logs()
    .slice(logStart)
    .filter((line) => line.event === name);

describe('the same key twice', () => {
  it('returns 201 then 200 with the same order, and stores one order with one set of items', async () => {
    const first = await post(BODY, KEY);
    const second = await post(BODY, KEY);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(orderIdOf(second)).toBe(orderIdOf(first));
    // The same body shape, the same order.
    expect(second.json()).toEqual(first.json());
    expect(await counts()).toEqual({ orders: 1, items: 2 });
    const { rows } = await t.pool.query<{ idempotency_key: string }>(
      'select idempotency_key from orders',
    );
    expect(rows).toEqual([{ idempotency_key: KEY }]);
  });

  it('returns the first order even when the second body differs (the body is not compared)', async () => {
    const first = await post(BODY, KEY);
    const second = await post(
      { patientId: PATIENT_B, labTestIds: [TEST_CBC] },
      KEY,
    );

    expect(second.statusCode).toBe(200);
    const replayed = orderListItemSchema.parse(second.json());
    expect(replayed.id).toBe(orderIdOf(first));
    expect(replayed.patient.id).toBe(PATIENT_A);
    expect(replayed.testCount).toBe(2);
    expect(await counts()).toEqual({ orders: 1, items: 2 });
  });

  it('treats a key written in upper case as the same key', async () => {
    const first = await post(BODY, KEY);
    const second = await post(BODY, KEY.toUpperCase());

    expect(second.statusCode).toBe(200);
    expect(orderIdOf(second)).toBe(orderIdOf(first));
    expect(await counts()).toEqual({ orders: 1, items: 2 });
  });

  it('creates the order on a retry after a refused attempt with that key (nothing was stored)', async () => {
    const refused = await post({ patientId: PATIENT_A, labTestIds: [] }, KEY);
    expect(refused.statusCode).toBe(422);
    expect(await counts()).toEqual({ orders: 0, items: 0 });

    const retry = await post(BODY, KEY);
    expect(retry.statusCode).toBe(201);
    expect(await counts()).toEqual({ orders: 1, items: 2 });
  });
});

describe('different keys and no key', () => {
  it('creates two orders for two keys', async () => {
    const first = await post(BODY, KEY);
    const second = await post(BODY, OTHER_KEY);

    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(orderIdOf(second)).not.toBe(orderIdOf(first));
    expect(await counts()).toEqual({ orders: 2, items: 4 });
  });

  it('creates an order on every request without a key, and stores no key', async () => {
    const first = await post(BODY);
    const second = await post(BODY);

    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(await counts()).toEqual({ orders: 2, items: 4 });
    const { rows } = await t.pool.query(
      'select id from orders where idempotency_key is not null',
    );
    expect(rows).toEqual([]);
  });

  it('treats an empty header as no key', async () => {
    const first = await post(BODY, '');
    const second = await post(BODY, '');

    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(await counts()).toEqual({ orders: 2, items: 4 });
  });
});

describe('a malformed key', () => {
  it.each(['not-a-key', '12345', `${KEY}, ${OTHER_KEY}`])(
    'refuses %j with 400 VALIDATION_ERROR and creates nothing',
    async (key) => {
      const response = await post(BODY, key);

      expect(response.statusCode).toBe(400);
      const { error } = errorBodySchema.parse(response.json());
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual([
        { field: 'idempotency-key', reason: 'Must be a uuid' },
      ]);
      expect(await counts()).toEqual({ orders: 0, items: 0 });
    },
  );
});

describe('the unique index', () => {
  it('refuses a second order with the same key written directly', async () => {
    await post(BODY, KEY);
    await expect(
      t.pool.query(
        `insert into orders
           (patient_id, status, estimated_ready_date, idempotency_key)
         values ($1, 'ordered', '2026-11-20', $2)`,
        [PATIENT_B, KEY],
      ),
    ).rejects.toMatchObject({
      code: '23505', // unique_violation
      constraint: 'orders_idempotency_key',
    });
  });
});

// Waits until `count` inserts into orders are blocked by the table lock.
async function waitForBlockedInserts(count: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await t.pool.query<{ n: number }>(
      `select count(*)::int as n from pg_locks
       where relation = 'orders'::regclass and not granted`,
    );
    if (rows[0]?.n === count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${count} inserts never waited for the table lock`);
}

describe('two requests with the same key at once', () => {
  it('create exactly one order; one gets 201, the other 200 with the same order', async () => {
    // Force the two requests to overlap. A share lock on the table, held by a
    // separate connection, lets the catalog reads through but makes every
    // insert into orders wait. Once both inserts are waiting, both requests
    // have checked their tests and neither has stored its order; releasing the
    // lock lets them race. A select-then-insert would let both through (two
    // 201s); here the unique index makes the second wait for the first and
    // then do nothing.
    const locker = await t.pool.connect();
    let responses;
    try {
      await locker.query('begin');
      await locker.query('lock table orders in share mode');
      const both = Promise.all([post(BODY, KEY), post(BODY, KEY)]);
      await waitForBlockedInserts(2);
      await locker.query('commit');
      responses = await both;
    } finally {
      locker.release();
    }

    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    expect(orderIdOf(responses[0])).toBe(orderIdOf(responses[1]));
    expect(await counts()).toEqual({ orders: 1, items: 2 });
    expect(event('order.created')).toHaveLength(1);
    expect(event('order.create_replayed')).toHaveLength(1);
  });
});

describe('logs', () => {
  it('logs a replay once at warn with the order id and the key, no patient detail, and no second order.created', async () => {
    const first = await post(BODY, KEY);
    const replayStart = t.logs().length;
    const second = await post(BODY, KEY);

    expect(event('order.created')).toHaveLength(1);
    const replayed = event('order.create_replayed');
    expect(replayed).toEqual([
      expect.objectContaining({
        level: 'warn',
        requestId: second.headers['x-request-id'],
        orderId: orderIdOf(first),
        idempotencyKey: KEY,
      }),
    ]);
    // Nothing about the patient in that line, nor anywhere in the replay's
    // log lines (the fixture patient is Alpha Fixture, born 1984-03-09).
    expect(Object.keys(replayed[0]!).sort()).toEqual(
      [
        'event',
        'idempotencyKey',
        'level',
        'msg',
        'orderId',
        'requestId',
        'time',
      ].sort(),
    );
    const replayText = JSON.stringify(t.logs().slice(replayStart));
    for (const detail of ['Alpha', 'Fixture', '1984-03-09', PATIENT_A]) {
      expect(replayText).not.toContain(detail);
    }
  });
});
