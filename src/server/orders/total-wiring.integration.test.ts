// The list's totals come from calculateTotal and from nowhere else (no SQL
// SUM, no second sum in the mapper): with the rule replaced by a stand-in,
// GET /api/orders must show the stand-in's answer, given the frozen prices.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { orderListSchema } from '../../shared/orders';
import type { TestApp } from '../testing/harness';
import { calculateTotal } from './domain/total';
import { CBC, insertCatalogAndPatients, insertOrder, LIPID } from './fixtures';

// Hoisted by Vitest above the imports. The integration setup file has already
// loaded the app with the real rule, so the app is loaded again below, after
// clearing the module cache, to get the stand-in.
vi.mock('./domain/total', () => ({ calculateTotal: vi.fn(() => 424242) }));

let t: TestApp;
let harness: typeof import('../testing/harness');

beforeAll(async () => {
  vi.resetModules();
  harness = await import('../testing/harness');
  t = harness.startTestApp();
});

beforeEach(async () => {
  await harness.truncateAllTables(t.pool);
  await insertCatalogAndPatients(t.pool);
});

afterAll(async () => {
  await t.close();
});

it('takes every total from calculateTotal, given the frozen item prices', async () => {
  await insertOrder(t.pool, {
    id: '40000000-0000-4000-8000-000000000001',
    createdAt: '2026-11-10T16:00:00Z',
    items: [CBC, LIPID],
  });
  const response = await t.inject({ method: 'GET', url: '/api/orders' });
  const { items } = orderListSchema.parse(response.json());
  expect(items[0]?.totalCents).toBe(424242);
  const [given] = vi.mocked(calculateTotal).mock.calls[0] ?? [];
  expect(given?.map((item) => item.priceCents).sort((a, b) => a - b)).toEqual(
    [CBC.priceCents, LIPID.priceCents].sort((a, b) => a - b),
  );
});
