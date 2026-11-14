// POST /api/orders through the app, on the test database: the transaction,
// the snapshot, the refusals and the logs.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  type OrderList,
  type OrderListItem,
  orderListItemSchema,
  orderListSchema,
} from '../../shared/orders';
import { inTransaction } from '../db/transaction';
import { withQueryLog } from '../db/query';
import { BusinessRuleError } from '../errors';
import {
  captureLogger,
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import { estimateReadyDate } from './domain/ready-date';
import {
  CBC,
  insertCatalogAndPatients,
  insertOrder as insertFixtureOrder,
  LIPID,
  PATIENT_A,
  TEST_CBC,
  TEST_CULT,
  TEST_LIPID,
} from './fixtures';
import { insertOrder, insertOrderItem } from './repo';

// 11:30 pm on Thursday 2026-11-12 in the clinic (Denver, UTC-7), already
// Friday in UTC: the ready date must count from the clinic's Thursday.
const NOW = new Date('2026-11-13T06:30:00Z');
const UNKNOWN_TEST = '30000000-0000-4000-8000-0000000000ff';
const UNKNOWN_PATIENT = '20000000-0000-4000-8000-0000000000ff';

let t: TestApp;
const clock = vi.fn(() => NOW);

beforeAll(() => {
  t = startTestApp({ clock });
});

beforeEach(async () => {
  await truncateAllTables(t.pool);
  await insertCatalogAndPatients(t.pool);
  clock.mockClear();
});

afterAll(async () => {
  await t.close();
});

function post(body: object) {
  return t.inject({ method: 'POST', url: '/api/orders', payload: body });
}

async function counts(): Promise<{ orders: number; items: number }> {
  const { rows } = await t.pool.query<{ orders: number; items: number }>(
    `select (select count(*)::int from orders) as orders,
            (select count(*)::int from order_items) as items`,
  );
  return rows[0]!;
}

async function list(): Promise<OrderList> {
  const response = await t.inject({ method: 'GET', url: '/api/orders' });
  return orderListSchema.parse(response.json());
}

describe('POST /api/orders: placing an order', () => {
  it('creates 1 order and 2 items for CBC and LIPID and returns it as a list row', async () => {
    const response = await post({
      patientId: PATIENT_A,
      labTestIds: [TEST_CBC, TEST_LIPID],
    });
    expect(response.statusCode).toBe(201);
    const order = orderListItemSchema.parse(response.json());
    expect(order).toEqual({
      id: order.id,
      status: 'ordered',
      patient: {
        id: PATIENT_A,
        firstName: 'Alpha',
        lastName: 'Fixture',
        dateOfBirth: '1984-03-09',
      },
      testCount: 2,
      totalCents: CBC.priceCents + LIPID.priceCents,
      estimatedReadyDate: estimateReadyDate(
        NOW,
        [CBC, LIPID],
        'America/Denver',
      ),
      createdAt: NOW.toISOString(),
      createdAtClinic: '2026-11-12 23:30',
    });
    expect(await counts()).toEqual({ orders: 1, items: 2 });
    // The same row GET /api/orders gives.
    expect((await list()).items).toEqual([order]);
  });

  it('copies each test’s code, name, price and turnaround into its item', async () => {
    const response = await post({
      patientId: PATIENT_A,
      labTestIds: [TEST_LIPID, TEST_CBC],
    });
    const { rows } = await t.pool.query(
      `select order_id, lab_test_id, test_code, test_name, price_cents, turnaround_days
       from order_items order by test_code`,
    );
    const orderId = response.json<OrderListItem>().id;
    expect(rows).toEqual([
      {
        order_id: orderId,
        lab_test_id: TEST_CBC,
        test_code: 'CBC',
        test_name: 'Complete Blood Count',
        price_cents: 2500,
        turnaround_days: 1,
      },
      {
        order_id: orderId,
        lab_test_id: TEST_LIPID,
        test_code: 'LIPID',
        test_name: 'Lipid Panel',
        price_cents: 3800,
        turnaround_days: 2,
      },
    ]);
  });

  it('reads the clock once and stores that instant as created_at and updated_at, with the ready date estimateReadyDate gives for it', async () => {
    await post({ patientId: PATIENT_A, labTestIds: [TEST_CBC, TEST_CULT] });
    expect(clock).toHaveBeenCalledTimes(1);
    const { rows } = await t.pool.query<{
      status: string;
      created_at: Date;
      updated_at: Date;
      estimated_ready_date: string;
    }>(
      'select status, created_at, updated_at, estimated_ready_date from orders',
    );
    expect(rows).toEqual([
      {
        status: 'ordered',
        created_at: NOW,
        updated_at: NOW,
        estimated_ready_date: estimateReadyDate(
          NOW,
          [{ turnaroundDays: 1 }, { turnaroundDays: 5 }],
          'America/Denver',
        ),
      },
    ]);
  });

  it('puts the new order at the top of the list', async () => {
    await insertFixtureOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000001',
      createdAt: '2026-11-10T16:00:00Z',
      items: [CBC],
    });
    const response = await post({
      patientId: PATIENT_A,
      labTestIds: [TEST_CBC, TEST_LIPID],
    });
    const { items } = await list();
    expect(items.map((order) => [order.id, order.testCount])).toEqual([
      [response.json<OrderListItem>().id, 2],
      ['40000000-0000-4000-8000-000000000001', 1],
    ]);
  });

  it('treats an id written in upper case as the same test', async () => {
    // An id with letters: the fixture ids are digits only, so upper-casing
    // them changes nothing.
    const hex = 'abcdef00-0000-4000-8000-0000000000ab';
    await t.pool.query(
      `insert into lab_tests (id, code, name, price_cents, turnaround_days)
       values ($1, 'HEXT', 'Hex id test', 100, 1)`,
      [hex],
    );
    const upper = await post({
      patientId: PATIENT_A,
      labTestIds: [hex.toUpperCase()],
    });
    expect(upper.statusCode).toBe(201);
    const twice = await post({
      patientId: PATIENT_A,
      labTestIds: [hex, hex.toUpperCase()],
    });
    expect(twice.statusCode).toBe(422);
    expect(
      twice.json<{ error: { details: { field: string; reason: string }[] } }>()
        .error.details,
    ).toEqual([
      {
        field: 'labTestIds.1',
        reason: `Lab test ${hex} is listed more than once`,
      },
    ]);
  });
});

describe('POST /api/orders: the snapshot', () => {
  it('keeps the items, total and ready date after the catalog row is changed and deactivated', async () => {
    const created = (
      await post({ patientId: PATIENT_A, labTestIds: [TEST_CBC, TEST_LIPID] })
    ).json<OrderListItem>();
    await t.pool.query(
      `update lab_tests set price_cents = 9999, name = 'Renamed',
         turnaround_days = 30 where id = $1`,
      [TEST_CBC],
    );
    await t.pool.query(
      'update lab_tests set is_active = false where id = any($1)',
      [[TEST_CBC, TEST_LIPID]],
    );
    const [order] = (await list()).items;
    expect(order).toEqual(created);
    expect(order?.totalCents).toBe(6300);
    const { rows } = await t.pool.query(
      `select test_name, price_cents, turnaround_days from order_items
       where lab_test_id = $1`,
      [TEST_CBC],
    );
    expect(rows).toEqual([
      {
        test_name: 'Complete Blood Count',
        price_cents: 2500,
        turnaround_days: 1,
      },
    ]);
  });
});

describe('POST /api/orders: refused with 422 and nothing saved', () => {
  async function expectRefused(
    body: object,
    code: string,
    details?: { field: string; reason: string }[],
  ) {
    const before = await counts();
    const response = await post(body);
    expect(response.statusCode).toBe(422);
    const { error } = response.json<{
      error: { code: string; details?: unknown; requestId: string };
    }>();
    expect(error.code).toBe(code);
    expect(error.requestId).toBe(response.headers['x-request-id']);
    if (details) expect(error.details).toEqual(details);
    expect(await counts()).toEqual(before);
  }

  beforeEach(async () => {
    // An order already there, so "unchanged" is not just "still empty".
    await insertFixtureOrder(t.pool, {
      id: '40000000-0000-4000-8000-000000000001',
      createdAt: '2026-11-10T16:00:00Z',
      items: [CBC, LIPID],
    });
  });

  it('an empty test list', async () => {
    await expectRefused(
      { patientId: PATIENT_A, labTestIds: [] },
      'INVALID_ORDER_TESTS',
      [{ field: 'labTestIds', reason: 'Choose at least one test' }],
    );
  });

  it('the same test twice', async () => {
    await expectRefused(
      { patientId: PATIENT_A, labTestIds: [TEST_CBC, TEST_LIPID, TEST_CBC] },
      'INVALID_ORDER_TESTS',
      [
        {
          field: 'labTestIds.2',
          reason: `Lab test ${TEST_CBC} is listed more than once`,
        },
      ],
    );
  });

  it('a test id that does not exist, among good ones', async () => {
    await expectRefused(
      {
        patientId: PATIENT_A,
        labTestIds: [TEST_CBC, UNKNOWN_TEST, TEST_LIPID],
      },
      'INVALID_ORDER_TESTS',
      [
        {
          field: 'labTestIds.1',
          reason: `Lab test ${UNKNOWN_TEST} does not exist`,
        },
      ],
    );
  });

  it('a test made inactive after the form loaded (the server decides)', async () => {
    await t.pool.query('update lab_tests set is_active = false where id = $1', [
      TEST_LIPID,
    ]);
    await expectRefused(
      { patientId: PATIENT_A, labTestIds: [TEST_CBC, TEST_LIPID] },
      'INVALID_ORDER_TESTS',
      [{ field: 'labTestIds.1', reason: `Lab test ${TEST_LIPID} is inactive` }],
    );
  });

  it('names every offending id, not only the first', async () => {
    await t.pool.query('update lab_tests set is_active = false where id = $1', [
      TEST_CULT,
    ]);
    await expectRefused(
      {
        patientId: PATIENT_A,
        labTestIds: [TEST_CULT, TEST_CBC, UNKNOWN_TEST, TEST_CBC],
      },
      'INVALID_ORDER_TESTS',
      [
        { field: 'labTestIds.0', reason: `Lab test ${TEST_CULT} is inactive` },
        {
          field: 'labTestIds.2',
          reason: `Lab test ${UNKNOWN_TEST} does not exist`,
        },
        {
          field: 'labTestIds.3',
          reason: `Lab test ${TEST_CBC} is listed more than once`,
        },
      ],
    );
  });

  it('the tests and the patient both wrong: the tests are reported, and nothing is inserted', async () => {
    const response = await post({
      patientId: UNKNOWN_PATIENT,
      labTestIds: [UNKNOWN_TEST],
    });
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'INVALID_ORDER_TESTS',
    );
    // The tests are checked before the order insert, so a refused list
    // never reaches an INSERT.
    const inserts = t
      .logs()
      .filter(
        (line) =>
          line.requestId === response.headers['x-request-id'] &&
          line.event === 'db.query' &&
          line.command === 'INSERT',
      );
    expect(inserts).toHaveLength(0);
  });

  it('a patient id that does not exist', async () => {
    await expectRefused(
      { patientId: UNKNOWN_PATIENT, labTestIds: [TEST_CBC] },
      'UNKNOWN_PATIENT',
      [{ field: 'patientId', reason: 'No patient has this id' }],
    );
  });
});

describe('POST /api/orders: a malformed body is a 400', () => {
  it.each([
    [
      'a patient id that is not a uuid',
      { patientId: 'abc', labTestIds: [TEST_CBC] },
    ],
    [
      'a test id that is not a uuid',
      { patientId: PATIENT_A, labTestIds: ['CBC'] },
    ],
    ['no patient id', { labTestIds: [TEST_CBC] }],
    ['no test list', { patientId: PATIENT_A }],
    [
      'a test list that is not a list',
      { patientId: PATIENT_A, labTestIds: TEST_CBC },
    ],
    [
      'an unknown extra field',
      { patientId: PATIENT_A, labTestIds: [TEST_CBC], status: 'completed' },
    ],
    ['a list instead of an object', [PATIENT_A, TEST_CBC]],
  ])('%s', async (_case, body) => {
    const response = await post(body);
    expect(response.statusCode).toBe(400);
    const { error } = response.json<{
      error: { code: string; requestId: string };
    }>();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.requestId).toBe(response.headers['x-request-id']);
    expect(await counts()).toEqual({ orders: 0, items: 0 });
  });
});

describe('POST /api/orders: all or nothing', () => {
  it('holds the catalog rows it copied, on its own connection, until the order commits', async () => {
    // Pause the order insert, so the transaction is still open after the
    // catalog read. Another connection must then wait to change the test.
    await t.pool.query(
      `create or replace function test_pause() returns trigger language plpgsql
       as $$ begin perform pg_sleep(0.5); return new; end $$`,
    );
    await t.pool.query(
      `create trigger test_pause before insert on orders
       for each row execute function test_pause()`,
    );
    const placing = post({ patientId: PATIENT_A, labTestIds: [TEST_CBC] });
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const other = await t.pool.connect();
      try {
        await other.query("set lock_timeout = '100ms'");
        await expect(
          other.query('update lab_tests set price_cents = 1 where id = $1', [
            TEST_CBC,
          ]),
        ).rejects.toMatchObject({ code: '55P03' }); // lock_not_available
      } finally {
        other.release();
      }
      expect((await placing).statusCode).toBe(201);
    } finally {
      // Never drop the trigger while the request still runs.
      await placing;
      await t.pool.query(
        'drop trigger if exists test_pause on orders; drop function if exists test_pause()',
      );
    }
  });

  it('leaves no order row when an item insert fails after the order was inserted', async () => {
    // A constraint that only this test adds, so the second item's insert
    // fails inside the transaction, after the order row and the first item.
    await t.pool.query(
      `alter table order_items add constraint test_refuses_lipid
       check (test_code <> 'LIPID')`,
    );
    try {
      const response = await post({
        patientId: PATIENT_A,
        labTestIds: [TEST_CBC, TEST_LIPID],
      });
      expect(response.statusCode).toBe(500);
      const requestId = response.headers['x-request-id'];
      const inserts = t
        .logs()
        .filter(
          (line) =>
            line.requestId === requestId &&
            line.event === 'db.query' &&
            line.command === 'INSERT',
        );
      // The order and CBC's item were inserted before LIPID's failed.
      expect(inserts).toHaveLength(2);
      expect(await counts()).toEqual({ orders: 0, items: 0 });
    } finally {
      await t.pool.query(
        'alter table order_items drop constraint test_refuses_lipid',
      );
    }
  });

  it('turns a repeated test that reaches the item insert into the 422, and saves nothing', async () => {
    // The service refuses a repeated test before inserting, so the primary
    // key is reached here by calling the repository directly.
    const log = captureLogger().logger;
    const attempt = inTransaction(t.pool, async (client) => {
      const db = withQueryLog(client, log);
      const orderId = await insertOrder(db, {
        patientId: PATIENT_A,
        status: 'ordered',
        estimatedReadyDate: '2026-11-16',
        createdAt: NOW,
      });
      const item = {
        labTestId: TEST_CBC,
        testCode: 'CBC',
        testName: 'Complete Blood Count',
        priceCents: 2500,
        turnaroundDays: 1,
      };
      await insertOrderItem(db, orderId, item);
      await insertOrderItem(db, orderId, item);
    });
    await expect(attempt).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(attempt).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_ORDER_TESTS',
    });
    expect(await counts()).toEqual({ orders: 0, items: 0 });
  });
});

describe('POST /api/orders: logs', () => {
  // Values that must never reach a log line, on a patient and a test.
  const MARKER_PATIENT = '20000000-0000-4000-8000-0000000000aa';
  const MARKER_TEST = '30000000-0000-4000-8000-0000000000aa';
  const MARKERS = [
    'Zorblaxfirst',
    'Quuxmarkerlast',
    '1911-11-11',
    'marker@example.test',
    'Glorpmarker Panel',
    'GLORP',
  ];

  beforeEach(async () => {
    await t.pool.query(
      `insert into patients (id, first_name, last_name, date_of_birth, email)
       values ($1, 'Zorblaxfirst', 'Quuxmarkerlast', '1911-11-11', 'marker@example.test')`,
      [MARKER_PATIENT],
    );
    await t.pool.query(
      `insert into lab_tests (id, code, name, price_cents, turnaround_days)
       values ($1, 'GLORP', 'Glorpmarker Panel', 1234, 3)`,
      [MARKER_TEST],
    );
  });

  const lines = (event: string) =>
    t.logs().filter((line) => line.event === event);

  it('logs order.created once at info with ids and the item count, and no patient or test detail', async () => {
    const before = lines('order.created').length;
    const response = await post({
      patientId: MARKER_PATIENT,
      labTestIds: [MARKER_TEST, TEST_CBC],
    });
    expect(response.statusCode).toBe(201);
    const created = lines('order.created').slice(before);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      level: 'info',
      orderId: response.json<OrderListItem>().id,
      patientId: MARKER_PATIENT,
      itemCount: 2,
    });
    expect(lines('order.ready_date_estimated').at(-1)).toMatchObject({
      level: 'debug',
      itemCount: 2,
      longestTurnaroundDays: 3,
    });
    for (const marker of MARKERS) expect(t.logText()).not.toContain(marker);
  });

  it.each<[string, () => object, boolean?]>([
    ['an empty list', () => ({ patientId: MARKER_PATIENT, labTestIds: [] })],
    [
      'a repeated test',
      () => ({
        patientId: MARKER_PATIENT,
        labTestIds: [MARKER_TEST, MARKER_TEST],
      }),
    ],
    [
      'an unknown test',
      () => ({ patientId: MARKER_PATIENT, labTestIds: [UNKNOWN_TEST] }),
    ],
    [
      'an inactive test',
      () => ({ patientId: MARKER_PATIENT, labTestIds: [MARKER_TEST] }),
      true,
    ],
    [
      'an unknown patient',
      () => ({ patientId: UNKNOWN_PATIENT, labTestIds: [MARKER_TEST] }),
    ],
    [
      'a malformed body',
      () => ({ patientId: MARKER_PATIENT, labTestIds: ['Glorpmarker Panel'] }),
    ],
  ])(
    'logs a refusal (%s) at warn with its code and a count, and no detail',
    async (_case, body, deactivate = false) => {
      if (deactivate) {
        await t.pool.query(
          'update lab_tests set is_active = false where id = $1',
          [MARKER_TEST],
        );
      }
      const created = lines('order.created').length;
      const response = await post(body());
      expect([400, 422]).toContain(response.statusCode);
      const rejected = lines('request.rejected').at(-1);
      expect(rejected).toMatchObject({
        level: 'warn',
        requestId: response.headers['x-request-id'],
        code: response.json<{ error: { code: string } }>().error.code,
      });
      expect(rejected?.fieldCount).toBeGreaterThan(0);
      expect(lines('order.created')).toHaveLength(created);
      for (const marker of MARKERS) expect(t.logText()).not.toContain(marker);
    },
  );
});
