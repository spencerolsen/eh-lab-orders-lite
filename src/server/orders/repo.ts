// The SQL for orders. Values are always bound parameters.
import { clinicDateTime } from '../../shared/dates';
import {
  type CancelOrderBody,
  type ListOrdersQuery,
  type OrderDetail,
  orderDetailSchema,
  type OrderListItem,
  orderListItemSchema,
  type OrderStatus,
} from '../../shared/orders';
import type { OrderItem } from '../../shared/order-items';
import type { LabTestRow } from '../catalog/repo';
import type { Db } from '../db/query';
import { BusinessRuleError } from '../errors';
import { toPage } from './domain/page';
import { calculateTotal } from './domain/total';
import { allowedNextStatuses, canCancel } from './domain/transitions';

// The message of every 422 INVALID_ORDER_TESTS; `details` says which ids.
export const INVALID_ORDER_TESTS_MESSAGE =
  'Some of the chosen tests cannot be ordered';

type OrderListRow = {
  id: string;
  status: OrderStatus;
  // A DATE column, read as the 'YYYY-MM-DD' string (src/server/db/types.ts).
  estimated_ready_date: string;
  created_at: Date;
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  // Every item's frozen price, one entry per item; [] for an order with none.
  item_prices: number[];
};

// One row of the list. The total and the test count come from the item
// prices: calculateTotal is the only place the total is worked out (there is
// no SUM in the SQL). Checked with the shared schema, so a missing or
// mistyped column throws here (a 500) instead of reaching the browser.
export function toOrderListItem(
  row: OrderListRow,
  clinicTimezone: string,
): OrderListItem {
  return orderListItemSchema.parse({
    id: row.id,
    status: row.status,
    patient: {
      id: row.patient_id,
      firstName: row.first_name,
      lastName: row.last_name,
      dateOfBirth: row.date_of_birth,
    },
    testCount: row.item_prices.length,
    totalCents: calculateTotal(
      row.item_prices.map((priceCents) => ({ priceCents })),
    ),
    estimatedReadyDate: row.estimated_ready_date,
    createdAt: row.created_at.toISOString(),
    createdAtClinic: clinicDateTime(clinicTimezone, row.created_at),
  });
}

// The columns and joins of one list row: each order's patient by a join, and
// its item prices gathered into an array (array_remove drops the single null a
// left join gives an order with no items, so such an order would show 0
// tests, not vanish). The caller adds the where and group by (the list read
// in listOrders has its own copy, which cuts the page before joining).
const LIST_ROW_SELECT = `
  select o.id, o.status, o.estimated_ready_date, o.created_at,
         p.id as patient_id, p.first_name, p.last_name, p.date_of_birth,
         array_remove(array_agg(i.price_cents), null) as item_prices
  from orders o
  join patients p on p.id = o.patient_id
  left join order_items i on i.order_id = o.id`;

// One page of orders, newest first; the id breaks ties between orders placed
// at the same moment, so the order (and so every page) is the same on every
// call. The filters combine with AND. One query: it asks for limit + 1 rows,
// and toPage turns the extra one into hasMore, so there is no COUNT.
export async function listOrders(
  db: Db,
  clinicTimezone: string,
  query: Pick<ListOrdersQuery, 'status' | 'patientId' | 'limit' | 'offset'>,
): Promise<{ items: OrderListItem[]; hasMore: boolean }> {
  // The where clause is built from fixed fragments; the values are always
  // bound parameters.
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (query.status !== undefined) {
    params.push(query.status);
    conditions.push('o.status = $' + params.length);
  }
  if (query.patientId !== undefined) {
    params.push(query.patientId);
    conditions.push('o.patient_id = $' + params.length);
  }
  params.push(query.limit + 1, query.offset);
  const where =
    conditions.length > 0 ? 'where ' + conditions.join(' and ') : '';
  // The page of orders is cut first, from orders alone, so Postgres can read
  // it from the filter's index in order and stop after limit + 1 rows; only
  // then are the patients and items joined, for those rows alone.
  const { rows } = await db.query<OrderListRow>(
    `select o.id, o.status, o.estimated_ready_date, o.created_at,
            p.id as patient_id, p.first_name, p.last_name, p.date_of_birth,
            array_remove(array_agg(i.price_cents), null) as item_prices
     from (select * from orders o
           ${where}
           order by o.created_at desc, o.id desc
           limit $` +
      (params.length - 1) +
      ` offset $` +
      params.length +
      `) o
     join patients p on p.id = o.patient_id
     left join order_items i on i.order_id = o.id
     group by o.id, o.status, o.estimated_ready_date, o.created_at, p.id
     order by o.created_at desc, o.id desc`,
    params,
  );
  const page = toPage(rows, query.limit);
  return {
    items: page.items.map((row) => toOrderListItem(row, clinicTimezone)),
    hasMore: page.hasMore,
  };
}

type OrderDetailRow = {
  id: string;
  status: OrderStatus;
  estimated_ready_date: string;
  created_at: Date;
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  email: string | null;
  phone: string | null;
  // All three set when the order is cancelled, all null otherwise (the
  // CHECK orders_cancellation_complete, migration 0007).
  cancellation_note: string | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
};

type OrderItemRow = {
  lab_test_id: string;
  test_code: string;
  test_name: string;
  price_cents: number;
  turnaround_days: number;
};

// One order with its patient and items, or null when there is no such order.
// The items come from the order_items columns (the prices frozen when the
// order was placed), never from lab_tests. The total goes through
// calculateTotal, and the allowed moves come from the transition table.
export async function getOrder(
  db: Db,
  id: string,
  clinicTimezone: string,
): Promise<OrderDetail | null> {
  const { rows } = await db.query<OrderDetailRow>(
    `select o.id, o.status, o.estimated_ready_date, o.created_at,
            p.id as patient_id, p.first_name, p.last_name, p.date_of_birth,
            p.email, p.phone,
            o.cancellation_note, o.cancelled_by, o.cancelled_at
     from orders o
     join patients p on p.id = o.patient_id
     where o.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const { rows: itemRows } = await db.query<OrderItemRow>(
    `select lab_test_id, test_code, test_name, price_cents, turnaround_days
     from order_items
     where order_id = $1
     order by test_code, lab_test_id`,
    [id],
  );
  const items = itemRows.map((item) => ({
    labTestId: item.lab_test_id,
    testCode: item.test_code,
    testName: item.test_name,
    priceCents: item.price_cents,
    turnaroundDays: item.turnaround_days,
  }));
  return orderDetailSchema.parse({
    id: row.id,
    status: row.status,
    patient: {
      id: row.patient_id,
      firstName: row.first_name,
      lastName: row.last_name,
      dateOfBirth: row.date_of_birth,
      email: row.email,
      phone: row.phone,
    },
    items,
    totalCents: calculateTotal(items),
    estimatedReadyDate: row.estimated_ready_date,
    createdAt: row.created_at.toISOString(),
    createdAtClinic: clinicDateTime(clinicTimezone, row.created_at),
    clinicTimezone,
    allowedNextStatuses: allowedNextStatuses(row.status),
    canCancel: canCancel(row.status),
    cancellation:
      row.cancelled_at === null
        ? null
        : {
            note: row.cancellation_note,
            cancelledBy: row.cancelled_by,
            cancelledAt: row.cancelled_at.toISOString(),
            cancelledAtClinic: clinicDateTime(clinicTimezone, row.cancelled_at),
          },
  });
}

// One order as a list row (the 201 of POST /api/orders), or null.
export async function findOrderListItem(
  db: Db,
  id: string,
  clinicTimezone: string,
): Promise<OrderListItem | null> {
  const { rows } = await db.query<OrderListRow>(
    `${LIST_ROW_SELECT}
     where o.id = $1
     group by o.id, p.id`,
    [id],
  );
  const row = rows[0];
  return row === undefined ? null : toOrderListItem(row, clinicTimezone);
}

// Postgres's SQLSTATEs for a foreign key and a unique violation, and the
// constraints they name (migration 0004_orders.sql).
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';
const PATIENT_FOREIGN_KEY = 'orders_patient_id_fkey';
const ITEM_PRIMARY_KEY = 'order_items_pkey';

function violates(error: unknown, sqlState: string, constraint: string) {
  const fields = (error ?? {}) as { code?: unknown; constraint?: unknown };
  return fields.code === sqlState && fields.constraint === constraint;
}

// A catalog row as placing an order reads it.
export type OrderableTest = OrderItem & { isActive: boolean };

// The catalog rows for these ids, active or not (an id with no row is simply
// missing from the result). FOR SHARE locks each row until the transaction
// ends: a deactivation or a price change sent at the same moment waits until
// the order is saved, so what is copied is what the catalog held at commit.
export async function findTestsForOrder(
  db: Db,
  labTestIds: readonly string[],
): Promise<OrderableTest[]> {
  const { rows } = await db.query<LabTestRow>(
    `select id, code, name, price_cents, turnaround_days, is_active
     from lab_tests where id = any($1::uuid[])
     for share`,
    [labTestIds],
  );
  return rows.map((row) => ({
    labTestId: row.id,
    testCode: row.code,
    testName: row.name,
    priceCents: row.price_cents,
    turnaroundDays: row.turnaround_days,
    isActive: row.is_active,
  }));
}

// Inserts the order row and returns its id. The patient is not looked up
// first: the foreign key decides, so there is no gap between a check and the
// insert, and its violation becomes the 422 UNKNOWN_PATIENT.
export async function insertOrder(
  db: Db,
  order: {
    patientId: string;
    status: OrderStatus;
    estimatedReadyDate: string;
    createdAt: Date;
  },
): Promise<string> {
  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into orders
         (patient_id, status, estimated_ready_date, created_at, updated_at)
       values ($1, $2, $3, $4, $4)
       returning id`,
      [
        order.patientId,
        order.status,
        order.estimatedReadyDate,
        order.createdAt,
      ],
    );
    return rows[0]!.id;
  } catch (error) {
    if (violates(error, FOREIGN_KEY_VIOLATION, PATIENT_FOREIGN_KEY)) {
      throw new BusinessRuleError(
        'UNKNOWN_PATIENT',
        'There is no patient with this id',
        [{ field: 'patientId', reason: 'No patient has this id' }],
      );
    }
    throw error;
  }
}

// Inserts one item: the snapshot of the test, copied as given. The primary
// key on (order_id, lab_test_id) is the backstop for a test listed twice: the
// service refuses that before inserting anything, and should one ever reach
// this insert, it is still the 422, never a 500.
export async function insertOrderItem(
  db: Db,
  orderId: string,
  item: OrderItem,
): Promise<void> {
  try {
    await db.query(
      `insert into order_items
         (order_id, lab_test_id, test_code, test_name, price_cents, turnaround_days)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        orderId,
        item.labTestId,
        item.testCode,
        item.testName,
        item.priceCents,
        item.turnaroundDays,
      ],
    );
  } catch (error) {
    if (violates(error, UNIQUE_VIOLATION, ITEM_PRIMARY_KEY)) {
      throw new BusinessRuleError(
        'INVALID_ORDER_TESTS',
        INVALID_ORDER_TESTS_MESSAGE,
        [
          {
            field: 'labTestIds',
            reason: `Lab test ${item.labTestId} is listed more than once`,
          },
        ],
      );
    }
    throw error;
  }
}

// Moves an order from `from` to `to`, only if it is still at `from`. Returns
// false when no row matched: the order is no longer at `from`, because someone
// else changed it after the caller read it (LAB-16). The condition on the old
// status is what makes two simultaneous clicks safe: the second update finds
// no row at the old status and changes nothing, instead of overwriting the
// first. updated_at is set here; there is no trigger. Nothing else changes
// (the ready date stays as it was stored).
export async function updateOrderStatus(
  db: Db,
  id: string,
  from: OrderStatus,
  to: OrderStatus,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `update orders
     set status = $3, updated_at = now()
     where id = $1 and status = $2`,
    [id, from, to],
  );
  return rowCount === 1;
}

// Cancels an order (LAB-17), only if it is still at `from`: the same
// conditional update as updateOrderStatus, with the reason, the name and the
// time set in the same statement. They must be: the CHECK
// orders_cancellation_complete refuses a cancelled row without all three, so
// the status cannot be changed first and the details added after. `to` is the
// cancelled status, passed in by the service. Returns false when no row
// matched (someone else changed the order after the caller read it).
export async function updateOrderStatusAndCancellation(
  db: Db,
  id: string,
  from: OrderStatus,
  to: OrderStatus,
  { note, cancelledBy }: CancelOrderBody,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `update orders
     set status = $3, cancellation_note = $4, cancelled_by = $5,
         cancelled_at = now(), updated_at = now()
     where id = $1 and status = $2`,
    [id, from, to, note, cancelledBy],
  );
  return rowCount === 1;
}
