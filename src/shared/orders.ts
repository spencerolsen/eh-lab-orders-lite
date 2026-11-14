// Orders: the list of statuses and the response schemas (docs/api.md), used
// by the server to build its replies and by the web app to check them.
import { z } from 'zod';

import { orderItemSchema } from './order-items';

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

// The query of GET /api/orders. Every value arrives as text, so the numbers
// are checked as text first: only digits count, which refuses "1.5", "-1",
// "1e1" and "". Strict: an unknown parameter is a 400. The default and the
// largest page are named here so the server and the screen share them.
export const DEFAULT_ORDER_LIMIT = 25;
export const MAX_ORDER_LIMIT = 100;

const limitText = `Must be a whole number from 1 to ${MAX_ORDER_LIMIT}`;
const offsetText = 'Must be a whole number, 0 or more';

export const listOrdersQuery = z.strictObject({
  status: z
    .enum(ORDER_STATUSES, {
      error: `Must be one of ${ORDER_STATUSES.join(', ')}`,
    })
    .optional(),
  patientId: z
    .uuid({ error: 'Must be a patient id (a uuid)' })
    .toLowerCase()
    .optional(),
  limit: z
    .string({ error: limitText })
    .regex(/^\d{1,9}$/, { error: limitText })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(1, { error: limitText })
        .max(MAX_ORDER_LIMIT, { error: limitText }),
    )
    .default(DEFAULT_ORDER_LIMIT),
  offset: z
    .string({ error: offsetText })
    .regex(/^\d{1,9}$/, { error: offsetText })
    .transform(Number)
    .default(0),
});

export type ListOrdersQuery = z.output<typeof listOrdersQuery>;

export type OrderListItem = z.infer<typeof orderListItemSchema>;
export type OrderList = z.infer<typeof orderListSchema>;

// GET /api/orders/:id: one order with its patient and the tests it holds.
export const orderDetailSchema = z.object({
  id: z.uuid(),
  status: orderStatusSchema,
  patient: z.object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    dateOfBirth: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  items: z.array(orderItemSchema),
  // Derived from the items by calculateTotal, never stored.
  totalCents: z.number().int(),
  estimatedReadyDate: z.string(),
  createdAt: z.string(),
  createdAtClinic: z.string(),
  // The IANA name createdAtClinic is in, so the screen can label it.
  clinicTimezone: z.string(),
  // Decided by the server's transition table; the browser repeats none of it.
  // The forward moves only; cancelling is canCancel.
  allowedNextStatuses: z.array(orderStatusSchema),
  canCancel: z.boolean(),
  // Who cancelled the order, when and why (LAB-17); null unless cancelled.
  // cancelledAt is the moment as an ISO 8601 string in UTC, and
  // cancelledAtClinic the same moment on the clinic's clock, in
  // clinicTimezone, as createdAtClinic is.
  cancellation: z
    .object({
      note: z.string(),
      cancelledBy: z.string(),
      cancelledAt: z.string(),
      cancelledAtClinic: z.string(),
    })
    .nullable(),
});

export type OrderDetail = z.infer<typeof orderDetailSchema>;
// POST /api/orders. Strict: an unknown field is a 400, and so is a missing
// field or an id that is not a uuid. An empty list has the right shape, so it
// passes here and is refused by the server as a 422 INVALID_ORDER_TESTS, with
// the other test-list rules (a repeated, unknown or inactive test). Ids are
// lower-cased, as Postgres prints them, so one test written in upper and in
// lower case counts as the same test (and so as repeated).
export const createOrderBody = z.strictObject({
  patientId: z.uuid({ error: 'Must be a patient id (a uuid)' }).toLowerCase(),
  labTestIds: z.array(
    z.uuid({ error: 'Must be a lab test id (a uuid)' }).toLowerCase(),
    { error: 'Must be a list of lab test ids' },
  ),
});

export type CreateOrderBody = z.output<typeof createOrderBody>;

// POST /api/orders/quote: the same test ids as an order, no patient. Ids are
// lower-cased like in createOrderBody, so both treat one id the same.
export const quoteOrderBody = z.strictObject({
  labTestIds: createOrderBody.shape.labTestIds,
});

export type QuoteOrderBody = z.output<typeof quoteOrderBody>;

// What the quote returns: the items as an order would snapshot them, and the
// total and ready date the server's rules give for them.
export const orderQuoteSchema = z.object({
  items: z.array(orderItemSchema),
  totalCents: z.number().int(),
  estimatedReadyDate: z.string(),
});

export type OrderQuote = z.infer<typeof orderQuoteSchema>;

// POST /api/orders/:id/transitions: move an order forward one step. `to` is
// any status except `ordered` (where every order starts, so nothing moves
// into it) and `cancelled` (cancelling has its own endpoint, LAB-17, with its
// own data). Whether the move is allowed from the order's current status is
// the transition table's call on the server, not this schema's.
export const orderTransitionBody = z.strictObject({
  to: orderStatusSchema.exclude(['ordered', 'cancelled'], {
    error: 'Must be a status this endpoint can move an order to',
  }),
});

export type OrderTransitionBody = z.infer<typeof orderTransitionBody>;

// POST /api/orders/:id/cancel (LAB-17): why the order is cancelled and who is
// cancelling it. There is no login, so the name is typed in. Both are
// trimmed, then required; the panel checks its form with this same schema.
// Every reason is fixed text and never repeats what was typed.
export const CANCEL_NOTE_MAX_LENGTH = 500;
export const CANCELLED_BY_MAX_LENGTH = 100;

const cancelText = z.string({
  error: (issue) =>
    issue.input === undefined ? 'is required' : 'must be text',
});

export const cancelOrderBody = z.strictObject({
  // Free text, so line breaks are allowed; other control characters (a NUL
  // cannot be stored in Postgres text) are not.
  note: cancelText
    .trim()
    .min(1, 'is required')
    .max(
      CANCEL_NOTE_MAX_LENGTH,
      `must be ${CANCEL_NOTE_MAX_LENGTH} characters or fewer`,
    )
    .regex(
      /^(?:[^\p{Cc}]|[\t\n\r])*$/u,
      'must not contain control characters other than line breaks',
    ),
  cancelledBy: cancelText
    .trim()
    .min(1, 'is required')
    .max(
      CANCELLED_BY_MAX_LENGTH,
      `must be ${CANCELLED_BY_MAX_LENGTH} characters or fewer`,
    )
    .regex(/^[^\p{Cc}]*$/u, 'must not contain control characters'),
});

export type CancelOrderBody = z.output<typeof cancelOrderBody>;
