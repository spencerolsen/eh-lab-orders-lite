// Cancelling asks the one transition table (LAB-15), never a list of its own:
// take cancelled out of the table for one request and the cancel is refused.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

import {
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import { TRANSITIONS } from './domain/transitions';
import { CBC, insertCatalogAndPatients, insertOrder } from './fixtures';

let t: TestApp;
const ID = '40000000-0000-4000-8000-000000000001';
// The live table, changed for one test and restored after it. (A vi.mock of
// ./domain/transitions does not reach the app's copy in this harness.)
const table = TRANSITIONS as Record<string, readonly string[]>;
const saved = { ...table };

beforeAll(() => {
  t = startTestApp();
});
beforeEach(async () => {
  await truncateAllTables(t.pool);
  await insertCatalogAndPatients(t.pool);
});
afterEach(() => Object.assign(table, saved));
afterAll(async () => {
  await t.close();
});

it('refuses a cancel the table does not list, even from ordered', async () => {
  await insertOrder(t.pool, {
    id: ID,
    createdAt: '2026-10-30T18:00:00Z',
    status: 'ordered',
    items: [CBC],
  });
  table.ordered = ['collected'];

  const response = await t.inject({
    method: 'POST',
    url: `/api/orders/${ID}/cancel`,
    payload: { note: 'n', cancelledBy: 'b' },
  });

  expect(response.statusCode).toBe(422);
});
