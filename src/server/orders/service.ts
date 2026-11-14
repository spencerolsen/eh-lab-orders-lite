// Placing an order (POST /api/orders). A service, unlike the other features,
// because it needs a transaction and combines the rules (which tests may be
// ordered, the ready date) with several queries.
import type { FastifyBaseLogger } from 'fastify';

import type { FieldProblem } from '../../shared/api-error';
import type { OrderItem } from '../../shared/order-items';
import type {
  CreateOrderBody,
  OrderListItem,
  OrderQuote,
  QuoteOrderBody,
} from '../../shared/orders';
import type { AppDeps } from '../app';
import { type Db, withQueryLog } from '../db/query';
import { inTransaction } from '../db/transaction';
import { BusinessRuleError } from '../errors';
import { calculateTotal } from './domain/total';
import { estimateReadyDate } from './domain/ready-date';
import {
  findOrderListItem,
  findTestsForOrder,
  INVALID_ORDER_TESTS_MESSAGE,
  insertOrder,
  insertOrderItem,
  type OrderableTest,
} from './repo';

// The test-list rules: an order needs at least one test, each test once, and
// every test must exist and be active. The whole list is checked and every
// offending id is named (by its position, labTestIds.<n>), not only the first.
// Returns the tests in the order they were asked for.
export function checkOrderTests(
  labTestIds: readonly string[],
  found: readonly OrderableTest[],
): OrderItem[] {
  if (labTestIds.length === 0) {
    throw new BusinessRuleError(
      'INVALID_ORDER_TESTS',
      'An order needs at least one test',
      [{ field: 'labTestIds', reason: 'Choose at least one test' }],
    );
  }
  const byId = new Map(found.map((test) => [test.labTestId, test]));
  const seen = new Set<string>();
  const problems: FieldProblem[] = [];
  const items: OrderItem[] = [];
  labTestIds.forEach((id, index) => {
    const test = byId.get(id);
    let reason: string | undefined;
    if (seen.has(id)) reason = `Lab test ${id} is listed more than once`;
    else if (test === undefined) reason = `Lab test ${id} does not exist`;
    else if (!test.isActive) reason = `Lab test ${id} is inactive`;
    seen.add(id);
    if (reason !== undefined) {
      problems.push({ field: `labTestIds.${index}`, reason });
    } else if (test !== undefined) {
      items.push({
        labTestId: test.labTestId,
        testCode: test.testCode,
        testName: test.testName,
        priceCents: test.priceCents,
        turnaroundDays: test.turnaroundDays,
      });
    }
  });
  if (problems.length > 0) {
    throw new BusinessRuleError(
      'INVALID_ORDER_TESTS',
      INVALID_ORDER_TESTS_MESSAGE,
      problems,
    );
  }
  return items;
}

// The catalog rows for an order, read on `db` and checked by the rules above.
// Shared with the quote (LAB-13), so both refuse the same lists.
export async function readOrderTests(
  db: Db,
  labTestIds: readonly string[],
): Promise<OrderItem[]> {
  const found =
    labTestIds.length === 0 ? [] : await findTestsForOrder(db, labTestIds);
  return checkOrderTests(labTestIds, found);
}

// The ready date of a list of tests, counted from `now` in the clinic's time
// zone. The one place createOrder and the quote both get it, so the preview
// and the stored order cannot drift. Logs ids and counts only.
export function readyDateFor(
  deps: Pick<AppDeps, 'clinicTimezone'>,
  log: FastifyBaseLogger,
  now: Date,
  items: readonly OrderItem[],
): string {
  const estimatedReadyDate = estimateReadyDate(
    now,
    items,
    deps.clinicTimezone,
  );
  log.debug(
    {
      event: 'order.ready_date_estimated',
      itemCount: items.length,
      longestTurnaroundDays: Math.max(
        ...items.map((item) => item.turnaroundDays),
      ),
      estimatedReadyDate,
    },
    'Ready date estimated',
  );
  return estimatedReadyDate;
}

// What an order of these tests would cost and when it would be ready, saving
// nothing (POST /api/orders/quote). Same validation, same rules, one `now`.
export async function quoteOrder(
  deps: AppDeps,
  log: FastifyBaseLogger,
  input: QuoteOrderBody,
): Promise<OrderQuote> {
  const now = deps.clock();
  const items = await readOrderTests(
    withQueryLog(deps.pool, log),
    input.labTestIds,
  );
  return {
    items,
    totalCents: calculateTotal(items),
    estimatedReadyDate: readyDateFor(deps, log, now, items),
  };
}

// Creates the order and returns it as a list row (the 201's body).
export async function createOrder(
  deps: AppDeps,
  log: FastifyBaseLogger,
  input: CreateOrderBody,
): Promise<{ order: OrderListItem; itemCount: number }> {
  // ONE NOW: the clock is read once. The same instant is the order's
  // created_at and the day the ready date counts from, so they cannot drift
  // apart (an order placed just before midnight is not dated one day and
  // estimated from the next).
  const now = deps.clock();

  // ALL OR NOTHING: the catalog read, the order and every item run in one
  // transaction on one connection. Any refusal or failure rolls it all back,
  // so no order is ever saved without all of its items.
  return inTransaction(deps.pool, async (client) => {
    const db = withQueryLog(client, log);

    // SNAPSHOT: each item copies the test's code, name, price and turnaround
    // as the catalog holds them now, read inside this transaction (and locked
    // until it ends). A later catalog change never alters this order. The
    // server is the authority: a test deactivated after the form loaded is
    // refused here, whatever the browser's list said.
    const items = await readOrderTests(db, input.labTestIds);

    // READY DATE: calculated once, here, by the rule in domain/ready-date.ts,
    // from `now` in the clinic's time zone, and stored on the order.
    const estimatedReadyDate = readyDateFor(deps, log, now, items);

    // A new order always starts as 'ordered'.
    const orderId = await insertOrder(db, {
      patientId: input.patientId,
      status: 'ordered',
      estimatedReadyDate,
      createdAt: now,
    });
    for (const item of items) {
      await insertOrderItem(db, orderId, item);
    }

    // Read back as the list shows it. The total is never stored: the list
    // row works it out from the items with calculateTotal.
    const order = await findOrderListItem(db, orderId, deps.clinicTimezone);
    if (order === null) throw new Error('The new order could not be read');
    return { order, itemCount: items.length };
  });
}
