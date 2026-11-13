// The SQL for orders. Values are always bound parameters.
import { clinicDateTime } from '../../shared/dates';
import {
  type OrderListItem,
  orderListItemSchema,
  type OrderStatus,
} from '../../shared/orders';
import type { Db } from '../db/query';
import { calculateTotal } from './domain/total';

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

// Every order, newest first; the id breaks ties between orders placed at the
// same moment, so the order is the same on every call. One query for the
// whole list: each order's patient by a join, and its item prices gathered
// into an array (array_remove drops the single null a left join gives an
// order with no items, so such an order would show 0 tests, not vanish).
export async function listOrders(
  db: Db,
  clinicTimezone: string,
): Promise<OrderListItem[]> {
  const { rows } = await db.query<OrderListRow>(
    `select o.id, o.status, o.estimated_ready_date, o.created_at,
            p.id as patient_id, p.first_name, p.last_name, p.date_of_birth,
            array_remove(array_agg(i.price_cents), null) as item_prices
     from orders o
     join patients p on p.id = o.patient_id
     left join order_items i on i.order_id = o.id
     group by o.id, p.id
     order by o.created_at desc, o.id desc`,
  );
  return rows.map((row) => toOrderListItem(row, clinicTimezone));
}
