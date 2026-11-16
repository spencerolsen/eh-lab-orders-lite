// GET /api/orders?sort=&dir= (LAB-26), through the app on the test database:
// the four sorts in both directions, ties, paging for every sort, and the
// filters and refusals alongside. Every name is obviously fake.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ORDER_SORT_DIRS,
  ORDER_SORTS,
  orderListSchema,
  type OrderList,
} from '../../shared/orders';
import {
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import { CBC, insertCatalogAndPatients, insertOrder } from './fixtures';

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
const patientId = (n: number) =>
  `21000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

// Patients whose last names differ in case and whose last names repeat.
const PATIENTS: [number, string, string][] = [
  [1, 'zed', 'adams'], // lower-case last name sorts with the others
  [2, 'Amy', 'Adams'],
  [3, 'Bob', 'baker'],
  [4, 'Al', 'Baker'],
  [5, 'Cy', 'Chen'],
];

type Row = [number, number, string, number, string];

// Orders: n, patient, status, created (minute), ready date. Several share a
// status, a ready date or a created time, so ties are exercised.
const ORDERS: Row[] = [
  [1, 5, 'completed', 10, '2026-11-20'],
  [2, 1, 'ordered', 20, '2026-11-18'],
  [3, 2, 'cancelled', 20, '2026-11-18'],
  [4, 3, 'collected', 30, '2026-11-25'],
  [5, 4, 'ordered', 40, '2026-11-18'],
  [6, 4, 'collected', 50, '2026-11-22'],
  [7, 3, 'ordered', 50, '2026-11-20'],
  [8, 5, 'completed', 59, '2026-11-20'],
];

async function insertAll() {
  for (const [n, first, last] of PATIENTS) {
    await t.pool.query(
      `insert into patients (id, first_name, last_name, date_of_birth, email)
       values ($1, $2, $3, '1980-01-01', $4)`,
      [patientId(n), first, last, `p${n}@example.test`],
    );
  }
  for (const [n, p, status, minute, readyDate] of ORDERS) {
    await insertOrder(t.pool, {
      id: id(n),
      patientId: patientId(p),
      status,
      readyDate,
      createdAt: `2026-11-10T16:${String(minute).padStart(2, '0')}:00Z`,
      items: [CBC],
    });
  }
}

async function list(query = ''): Promise<OrderList> {
  const response = await t.inject({
    method: 'GET',
    url: `/api/orders${query}`,
  });
  expect(response.statusCode).toBe(200);
  return orderListSchema.parse(response.json());
}

const nums = (body: OrderList) =>
  body.items.map((o) => Number(o.id.slice(-12)));

// The expected order of order numbers: sort by `key`, ties by id the same way
// as the direction.
function expected(key: (o: Row) => string | number, dir: string): number[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...ORDERS]
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka < kb) return -sign;
      if (ka > kb) return sign;
      return sign * (a[0] - b[0]);
    })
    .map((o) => o[0]);
}

const patientOf = (o: Row) => PATIENTS.find((p) => p[0] === o[1])!;
const STATUS_RANK = ['ordered', 'collected', 'completed', 'cancelled'];

const KEYS: Record<string, (o: Row) => string | number> = {
  created: (o) => o[3],
  readyBy: (o) => o[4],
  status: (o) => STATUS_RANK.indexOf(o[2]),
  patient: (o) =>
    `${patientOf(o)[2].toLowerCase()}|${patientOf(o)[1].toLowerCase()}`,
};

const EVERY_SORT = ORDER_SORTS.flatMap((sort) =>
  ORDER_SORT_DIRS.map((dir) => [sort, dir] as const),
);

describe('GET /api/orders sort', () => {
  it.each(EVERY_SORT)(
    'sort=%s dir=%s returns the right order',
    async (sort, dir) => {
      await insertAll();
      const body = await list(`?sort=${sort}&dir=${dir}`);
      expect(nums(body)).toEqual(expected(KEYS[sort]!, dir));
    },
  );

  it('no sort is newest first, the same as sort=created&dir=desc', async () => {
    await insertAll();
    const plain = await list();
    expect(nums(plain)).toEqual(nums(await list('?sort=created&dir=desc')));
    expect(nums(plain)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('dir alone sorts the default column', async () => {
    await insertAll();
    expect(nums(await list('?dir=asc'))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('status is lifecycle order, not alphabetical', async () => {
    await insertAll();
    const statuses = (await list('?sort=status&dir=asc')).items.map(
      (o) => o.status,
    );
    expect([...new Set(statuses)]).toEqual([
      'ordered',
      'collected',
      'completed',
      'cancelled',
    ]);
  });

  it('patient is last name then first name, ignoring case', async () => {
    await insertAll();
    const names = (await list('?sort=patient&dir=asc')).items.map(
      (o) => `${o.patient.lastName} ${o.patient.firstName}`,
    );
    expect(names).toEqual([
      'Adams Amy',
      'adams zed',
      'Baker Al',
      'Baker Al',
      'baker Bob',
      'baker Bob',
      'Chen Cy',
      'Chen Cy',
    ]);
  });

  it.each(EVERY_SORT)(
    'sort=%s dir=%s pages with limit=2 return every order exactly once, in the same order',
    async (sort, dir) => {
      await insertAll();
      const whole = nums(await list(`?sort=${sort}&dir=${dir}`));
      const paged: number[] = [];
      for (let offset = 0; offset < 8; offset += 2) {
        const page = await list(
          `?sort=${sort}&dir=${dir}&limit=2&offset=${offset}`,
        );
        expect(page.hasMore).toBe(offset + 2 < 8);
        paged.push(...nums(page));
      }
      expect(paged).toEqual(whole);
      expect(new Set(paged).size).toBe(8);
    },
  );

  it('the same request twice gives the same order', async () => {
    await insertAll();
    const a = nums(await list('?sort=status&dir=desc'));
    const b = nums(await list('?sort=status&dir=desc'));
    expect(a).toEqual(b);
  });

  it('sort combines with the status filter', async () => {
    await insertAll();
    expect(nums(await list('?status=ordered&sort=readyBy&dir=asc'))).toEqual([
      2, 5, 7,
    ]);
  });

  it('sort combines with the patient filter', async () => {
    await insertAll();
    expect(
      nums(await list(`?patientId=${patientId(4)}&sort=status&dir=asc`)),
    ).toEqual([5, 6]);
    expect(
      nums(await list(`?patientId=${patientId(4)}&sort=patient&dir=desc`)),
    ).toEqual([6, 5]);
  });

  it('sort combines with both filters', async () => {
    await insertAll();
    expect(
      nums(
        await list(
          `?status=collected&patientId=${patientId(3)}&sort=created&dir=asc`,
        ),
      ),
    ).toEqual([4]);
  });

  it('logs the sort and direction as field names, never a value of an order', async () => {
    await insertAll();
    const response = await t.inject({
      method: 'GET',
      url: '/api/orders?sort=patient&dir=asc',
    });
    const requestId = response.headers['x-request-id'];
    const line = t
      .logs()
      .find((l) => l.event === 'orders.listed' && l.requestId === requestId);
    expect(line).toMatchObject({ sort: 'patient', dir: 'asc' });
    expect(JSON.stringify(t.logs())).not.toContain('Adams');
  });
});

describe('GET /api/orders sort refusals', () => {
  it.each([
    ['sort=bogus', 'sort'],
    ['sort=total', 'sort'],
    ['sort=tests', 'sort'],
    ['sort=Created', 'sort'],
    ['sort=', 'sort'],
    ['dir=up', 'dir'],
    ['dir=ASC', 'dir'],
    ['sort=status&dir=sideways', 'dir'],
    ['sort=created&sort=status', 'sort'],
    ['sort=created;drop%20table%20orders', 'sort'],
  ])('%s is a 400 VALIDATION_ERROR naming %s', async (query, field) => {
    const response = await t.inject({
      method: 'GET',
      url: `/api/orders?${query}`,
    });
    expect(response.statusCode).toBe(400);
    const { error } = response.json<{
      error: { code: string; requestId: string; details: { field: string }[] };
    }>();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.requestId).toEqual(expect.any(String));
    expect(error.details.map((d) => d.field)).toEqual([field]);
  });
});
