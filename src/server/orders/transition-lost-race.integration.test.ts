// The service's answer when the conditional update changes no row (LAB-16),
// with no hook in production code: the orders repository is replaced so that
// updateOrderStatus always reports zero rows, as it does when someone else
// changed the order between the read and the update. Everything else is real.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { errorBodySchema } from '../../shared/api-error';
import type { TestApp } from '../testing/harness';
import { CBC, insertCatalogAndPatients, insertOrder } from './fixtures';
import { updateOrderStatus } from './repo';

// Hoisted by Vitest above the imports. The integration setup file has already
// loaded the app with the real repository, so the app is loaded again below,
// after clearing the module cache, to get this one.
vi.mock('./repo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./repo')>()),
  updateOrderStatus: vi.fn(() => Promise.resolve(false)),
}));

let t: TestApp;
let harness: typeof import('../testing/harness');
// Where this test's log lines start: one app serves the whole file.
let logStart = 0;

const ORDER_ID = '40000000-0000-4000-8000-000000000001';

beforeAll(async () => {
  vi.resetModules();
  harness = await import('../testing/harness');
  t = harness.startTestApp();
});

beforeEach(async () => {
  vi.mocked(updateOrderStatus).mockClear();
  await harness.truncateAllTables(t.pool);
  await insertCatalogAndPatients(t.pool);
  await insertOrder(t.pool, {
    id: ORDER_ID,
    createdAt: '2026-10-30T18:00:00Z',
    status: 'ordered',
    items: [CBC],
  });
  logStart = t.logs().length;
});

afterAll(async () => {
  await t.close();
});

function move(to: string) {
  return t.inject({
    method: 'POST',
    url: `/api/orders/${ORDER_ID}/transitions`,
    payload: { to },
  });
}

it('answers 409 ORDER_CHANGED when the update changes no row', async () => {
  const response = await move('collected');

  expect(vi.mocked(updateOrderStatus)).toHaveBeenCalledOnce();
  expect(response.statusCode).toBe(409);
  expect(errorBodySchema.parse(response.json()).error).toMatchObject({
    code: 'ORDER_CHANGED',
    message: 'This order was changed by someone else',
  });
  const events = t
    .logs()
    .slice(logStart)
    .map((line) => line.event);
  expect(events).toContain('order.transition_lost_race');
  expect(events).not.toContain('order.status_changed');
  expect(events).not.toContain('order.transition_refused');
});

// A different path: the domain check refuses the move before any update is
// tried, so it is a 422, never the 409 the (zero-row) update would give.
it('answers an illegal move with 422 without trying the update', async () => {
  const response = await move('completed');

  expect(vi.mocked(updateOrderStatus)).not.toHaveBeenCalled();
  expect(response.statusCode).toBe(422);
  expect(errorBodySchema.parse(response.json()).error.code).toBe(
    'ILLEGAL_TRANSITION',
  );
  const events = t
    .logs()
    .slice(logStart)
    .map((line) => line.event);
  expect(events).not.toContain('order.transition_lost_race');
});
