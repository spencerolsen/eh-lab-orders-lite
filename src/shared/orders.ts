// Orders: the list of statuses and the response schemas (docs/api.md), used
// by the server to build its replies and by the web app to check them.
import { z } from 'zod';

// Every order status, in the order an order moves through them. This is the
// one list in code: schemas, the transition table (LAB-15) and the screen's
// labels derive from it. The database CHECK on orders.status (migration
// 0004_orders.sql) is the only other place the statuses are written; a test
// checks the two agree. To add a status, see "Adding an order status" in
// AGENTS.md.
export const ORDER_STATUSES = [
  'ordered',
  'collected',
  'completed',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusSchema = z.enum(ORDER_STATUSES);

// The word shown on screen for each status. Keyed by OrderStatus, so a new
// status without a label is a type error.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  ordered: 'Ordered',
  collected: 'Collected',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// One row of GET /api/orders.
export const orderListItemSchema = z.object({
  id: z.uuid(),
  status: orderStatusSchema,
  patient: z.object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    dateOfBirth: z.string(),
  }),
  testCount: z.number().int(),
  // Derived from the items by calculateTotal, never stored.
  totalCents: z.number().int(),
  // 'YYYY-MM-DD', stored when the order was placed.
  estimatedReadyDate: z.string(),
  // The moment, as an ISO 8601 string in UTC.
  createdAt: z.string(),
  // The same moment as the clinic's wall clock, 'YYYY-MM-DD HH:mm', in
  // clinicTimezone. The screen shows this, never the browser's time zone.
  createdAtClinic: z.string(),
});

// GET /api/orders. An object, not a bare array, so paging (hasMore, LAB-14)
// and the time zone label can sit next to the rows.
export const orderListSchema = z.object({
  items: z.array(orderListItemSchema),
  hasMore: z.boolean(),
  clinicTimezone: z.string(),
});

export type OrderListItem = z.infer<typeof orderListItemSchema>;
export type OrderList = z.infer<typeof orderListSchema>;
