// POST /api/orders/quote through the app, on the test database: it gives the
// same total and ready date as placing the same order, and saves nothing.
// The arithmetic and the other list refusals are owned by LAB-11 and LAB-12.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { errorBodySchema } from '../../shared/api-error';
import { orderListItemSchema, orderQuoteSchema } from '../../shared/orders';
import {
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import {
  insertCatalogAndPatients,
  PATIENT_A,
  TEST_CBC,
  TEST_CULT,
  TEST_LIPID,
} from './fixtures';

// Late evening in the clinic, already tomorrow in UTC.
const NOW = new Date('2026-11-13T06:30:00Z');

let t: TestApp;
const clock = vi.fn(() => NOW);

beforeAll(() => {
  t = startTestApp({ clock });
});

beforeEach(async () => {
  await truncateAllTables(t.pool);
  await insertCatalogAndPatients(t.pool);
});

afterAll(async () => {
  await t.close();
});

const quote = (body: object) =>
  t.inject({ method: 'POST', url: '/api/orders/quote', payload: body });

async function counts() {
  const { rows } = await t.pool.query<{ orders: number; items: number }>(
    `select (select count(*)::int from orders) as orders,
            (select count(*)::int from order_items) as items`,
  );
  return rows[0]!;
}

it('gives the same total and ready date as placing the same order, and saves nothing', async () => {
  const labTestIds = [TEST_CBC, TEST_CULT];
  const before = await counts();
  const first = await quote({ labTestIds });
  const second = await quote({ labTestIds });
  expect(first.statusCode).toBe(200);
  expect(second.statusCode).toBe(200);
  expect(await counts()).toEqual(before);

  const quoted = orderQuoteSchema.parse(first.json());
  expect(quoted.items.map((item) => item.labTestId)).toEqual(labTestIds);

  const placed = await t.inject({
    method: 'POST',
    url: '/api/orders',
    payload: { patientId: PATIENT_A, labTestIds },
  });
  const order = orderListItemSchema.parse(placed.json());
  expect(quoted.totalCents).toBe(order.totalCents);
  expect(quoted.estimatedReadyDate).toBe(order.estimatedReadyDate);
});

it('refuses an inactive test with 422 INVALID_ORDER_TESTS (the shared validation)', async () => {
  await t.pool.query('update lab_tests set is_active = false where id = $1', [
    TEST_LIPID,
  ]);
  const response = await quote({ labTestIds: [TEST_CBC, TEST_LIPID] });
  expect(response.statusCode).toBe(422);
  const { error } = errorBodySchema.parse(response.json());
  expect(error.code).toBe('INVALID_ORDER_TESTS');
  expect(error.details).toEqual([
    { field: 'labTestIds.1', reason: `Lab test ${TEST_LIPID} is inactive` },
  ]);
});

it('refuses a malformed body with 400 VALIDATION_ERROR', async () => {
  for (const body of [
    { labTestIds: 'nope' },
    { labTestIds: [TEST_CBC], patientId: PATIENT_A },
    {},
  ]) {
    const response = await quote(body);
    expect(response.statusCode).toBe(400);
    expect(errorBodySchema.parse(response.json()).error.code).toBe(
      'VALIDATION_ERROR',
    );
  }
});
