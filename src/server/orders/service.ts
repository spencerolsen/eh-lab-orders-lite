// Placing an order (POST /api/orders), changing its status (POST
// /api/orders/:id/transitions) and cancelling it (POST /api/orders/:id/cancel). A service, unlike the other features, because
// each combines the rules (which tests may be ordered, the ready date, the
// legal moves) with several queries, and placing an order needs a transaction.
import type { FastifyBaseLogger } from 'fastify';

import type { FieldProblem } from '../../shared/api-error';
import type { OrderItem } from '../../shared/order-items';
import type {
  CancelOrderBody,
  CreateOrderBody,
  OrderDetail,
  OrderListItem,
  OrderQuote,
  OrderStatus,
  OrderTransitionBody,
  QuoteOrderBody,
} from '../../shared/orders';
import type { AppDeps } from '../app';
import { type Db, withQueryLog } from '../db/query';
import { inTransaction } from '../db/transaction';
import { BusinessRuleError, ConflictError, NotFoundError } from '../errors';
import { calculateTotal } from './domain/total';
import { estimateReadyDate } from './domain/ready-date';
import { assertTransition, InvalidTransitionError } from './domain/transitions';
import {
  findOrderIdByIdempotencyKey,
  findOrderListItem,
  findTestsForOrder,
  getOrder,
  INVALID_ORDER_TESTS_MESSAGE,
  insertOrder,
  insertOrderItem,
  type OrderableTest,
  updateOrderStatus,
  updateOrderStatusAndCancellation,
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
  const estimatedReadyDate = estimateReadyDate(now, items, deps.clinicTimezone);
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

// What placing an order gives back: the order as a list row (the body of the
// 201, or of the 200 for a replay) and whether it was created now.
export type CreateOrderResult =
  | { replayed: false; order: OrderListItem; itemCount: number }
  | { replayed: true; order: OrderListItem };

// The order an idempotency key placed, as a list row, or null: none yet, or
// no key was sent.
async function orderPlacedWith(
  db: Db,
  idempotencyKey: string | null,
  clinicTimezone: string,
): Promise<OrderListItem | null> {
  if (idempotencyKey === null) return null;
  const id = await findOrderIdByIdempotencyKey(db, idempotencyKey);
  return id === null ? null : findOrderListItem(db, id, clinicTimezone);
}

// Creates the order and returns it as a list row. With an idempotency key
// (the Idempotency-Key header, LAB-18) that an earlier order already holds,
// nothing is written and that earlier order is returned instead: a double
// click or a retry places one order, not two.
export async function createOrder(
  deps: AppDeps,
  log: FastifyBaseLogger,
  input: CreateOrderBody,
  idempotencyKey: string | null = null,
): Promise<CreateOrderResult> {
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

    // REPLAY: this key already placed an order. Return that order as it is
    // stored, before anything is checked: a repeat of the key always gets the
    // first order, even if one of its tests was deactivated since, and
    // whatever this request's body says (it is not compared).
    const earlier = await orderPlacedWith(
      db,
      idempotencyKey,
      deps.clinicTimezone,
    );
    if (earlier !== null) return { replayed: true, order: earlier };

    // SNAPSHOT: each item copies the test's code, name, price and turnaround
    // as the catalog holds them now, read inside this transaction (and locked
    // until it ends). A later catalog change never alters this order. The
    // server is the authority: a test deactivated after the form loaded is
    // refused here, whatever the browser's list said.
    const items = await readOrderTests(db, input.labTestIds);

    // READY DATE: calculated once, here, by the rule in domain/ready-date.ts,
    // from `now` in the clinic's time zone, and stored on the order.
    const estimatedReadyDate = readyDateFor(deps, log, now, items);

    // A new order always starts as 'ordered'. ONE ORDER PER KEY: the unique
    // index decides, not the lookup above. If a request with the same key got
    // here first, this insert waits until it commits, then does nothing.
    const orderId = await insertOrder(db, {
      patientId: input.patientId,
      status: 'ordered',
      estimatedReadyDate,
      createdAt: now,
      idempotencyKey,
    });

    // LOST RACE: that other request won. Return its order, inserting no
    // items. Reading it is a new statement, so it sees the committed row.
    if (orderId === null) {
      const winner = await orderPlacedWith(
        db,
        idempotencyKey,
        deps.clinicTimezone,
      );
      if (winner === null) throw new Error('The order was not inserted');
      return { replayed: true, order: winner };
    }

    for (const item of items) {
      await insertOrderItem(db, orderId, item);
    }

    // Read back as the list shows it. The total is never stored: the list
    // row works it out from the items with calculateTotal.
    const order = await findOrderListItem(db, orderId, deps.clinicTimezone);
    if (order === null) throw new Error('The new order could not be read');
    return { replayed: false, order, itemCount: items.length };
  });
}

// The message of every 409 ORDER_CHANGED; the panel shows it as is.
export const ORDER_CHANGED_MESSAGE = 'This order was changed by someone else';

// The warn events of one kind of status change: the move refused by the
// table, and the update that found the order already changed.
type MoveEvents = { refused: string; lostRace: string };

// The steps every status change shares (LAB-16 moves it forward, LAB-17
// cancels it). Read, check, then a conditional update, in this order, so each
// failure has its own answer and means one thing to the user:
// 404 the order is not there; 422 the rules do not allow this move from its
// status; 409 the move was allowed, but someone changed the order first.
// `update` runs the conditional update from the status read and reports
// whether it changed the row. Returns the order as it is now, and the status
// it was moved from. The caller logs the change itself.
async function moveOrder(
  deps: AppDeps,
  log: FastifyBaseLogger,
  id: string,
  to: OrderStatus,
  update: (db: Db, from: OrderStatus) => Promise<boolean>,
  events: MoveEvents,
): Promise<{ order: OrderDetail; from: OrderStatus }> {
  const db = withQueryLog(deps.pool, log);

  // 1. READ: the order as it is now. Missing: 404 NOT_FOUND.
  const order = await getOrder(db, id, deps.clinicTimezone);
  if (order === null) throw new NotFoundError('There is no such order');
  const from = order.status;

  // 2. CHECK: the transition table decides, against the status just read.
  // Only ordered -> collected -> completed, no skipping, no going back;
  // ordered and collected may be cancelled; completed and cancelled are
  // final. Refused: 422 ILLEGAL_TRANSITION, and the update is never tried.
  try {
    assertTransition(from, to);
  } catch (error) {
    if (!(error instanceof InvalidTransitionError)) throw error;
    log.warn(
      {
        event: events.refused,
        code: 'ILLEGAL_TRANSITION',
        orderId: id,
        from,
        to,
      },
      'Order status change refused',
    );
    throw new BusinessRuleError('ILLEGAL_TRANSITION', error.message);
  }

  // 3. UPDATE, only if the order is still at the status the check saw. Zero
  // rows: someone else changed it between the read and here (two people
  // clicking at once). Nothing is overwritten: 409 ORDER_CHANGED, reload.
  if (!(await update(db, from))) {
    log.warn(
      {
        event: events.lostRace,
        code: 'ORDER_CHANGED',
        orderId: id,
        expected: from,
        to,
      },
      'Order changed before its status could be changed',
    );
    throw new ConflictError('ORDER_CHANGED', ORDER_CHANGED_MESSAGE);
  }

  // The order as it is now, with its new allowedNextStatuses and canCancel.
  const changed = await getOrder(db, id, deps.clinicTimezone);
  if (changed === null) throw new Error('The changed order could not be read');
  return { order: changed, from };
}

// Moves an order one step forward (POST /api/orders/:id/transitions) and
// returns it as GET /api/orders/:id does.
export async function changeOrderStatus(
  deps: AppDeps,
  log: FastifyBaseLogger,
  id: string,
  { to }: OrderTransitionBody,
): Promise<OrderDetail> {
  const { order, from } = await moveOrder(
    deps,
    log,
    id,
    to,
    (db, from) => updateOrderStatus(db, id, from, to),
    {
      refused: 'order.transition_refused',
      lostRace: 'order.transition_lost_race',
    },
  );
  log.info(
    { event: 'order.status_changed', orderId: id, from, to },
    'Order status changed',
  );
  return order;
}

// Cancels an order (POST /api/orders/:id/cancel) with why and who, and
// returns it as GET /api/orders/:id does. The same steps as a forward move:
// the transition table alone says which statuses can be cancelled. The note
// and the name are free text typed by staff, so they are never logged.
export async function cancelOrder(
  deps: AppDeps,
  log: FastifyBaseLogger,
  id: string,
  cancellation: CancelOrderBody,
): Promise<OrderDetail> {
  const to: OrderStatus = 'cancelled';
  const { order, from } = await moveOrder(
    deps,
    log,
    id,
    to,
    (db, from) =>
      updateOrderStatusAndCancellation(db, id, from, to, cancellation),
    { refused: 'order.cancel_refused', lostRace: 'order.cancel_lost_race' },
  );
  log.info({ event: 'order.cancelled', orderId: id, from }, 'Order cancelled');
  return order;
}
