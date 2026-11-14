// The order requests the pages make, each checked with the shared schema.
import {
  type CancelOrderBody,
  type CreateOrderBody,
  IDEMPOTENCY_KEY_HEADER,
  type OrderDetail,
  orderDetailSchema,
  type OrderList,
  type OrderListItem,
  orderListItemSchema,
  orderListSchema,
  type OrderQuote,
  orderQuoteSchema,
  type OrderTransitionBody,
} from '../../shared/orders';
import { apiFetch } from '../api/client';
import type { OrderFilters } from './filters';

// The TanStack Query key of the order list; placing an order (LAB-12),
// changing a status (LAB-16) and cancelling (LAB-17) refresh it.
export const ORDERS_KEY = ['orders'] as const;

// The list's key: every filter combination is its own cache entry.
export const orderListKey = (filters: OrderFilters) =>
  [...ORDERS_KEY, 'list', filters] as const;

// One page of the list: the orders matching `filters`, starting at `offset`
// (the server's default page size; docs/api.md).
export async function fetchOrders(
  filters: OrderFilters,
  offset: number,
  signal?: AbortSignal,
): Promise<OrderList> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.patientId) params.set('patientId', filters.patientId);
  if (offset > 0) params.set('offset', String(offset));
  const query = params.toString();
  return orderListSchema.parse(
    await apiFetch(query ? `/api/orders?${query}` : '/api/orders', { signal }),
  );
}

// One order's key sits under ORDERS_KEY, so refreshing the list refreshes it too.
export const orderKey = (id: string) => ['orders', id] as const;

export async function fetchOrder(
  id: string,
  signal?: AbortSignal,
): Promise<OrderDetail> {
  return orderDetailSchema.parse(
    await apiFetch(`/api/orders/${id}`, { signal }),
  );
}

// How long placing an order may take before the modal gives up and shows
// "Can't reach the server. Try again." (LAB-18). The modal cannot be closed
// while the request runs, so a server that never answers must not lock it.
// The order may still have been placed: a retry sends the same key and gets it.
export const CREATE_ORDER_TIMEOUT_MS = 30_000;

// POST /api/orders: the new order, as a row of the list. The key names this
// attempt to place an order: sent again, it returns the order it placed
// (200) instead of a second one (LAB-18).
export async function createOrder(
  body: CreateOrderBody,
  idempotencyKey: string,
): Promise<OrderListItem> {
  return orderListItemSchema.parse(
    await apiFetch('/api/orders', {
      method: 'POST',
      body,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      timeoutMs: CREATE_ORDER_TIMEOUT_MS,
    }),
  );
}

// POST /api/orders/quote: what an order of these tests would cost and when it
// would be ready. Saves nothing.
export async function fetchQuote(
  labTestIds: string[],
  signal?: AbortSignal,
): Promise<OrderQuote> {
  return orderQuoteSchema.parse(
    await apiFetch('/api/orders/quote', {
      method: 'POST',
      body: { labTestIds },
      signal,
    }),
  );
}

// POST /api/orders/:id/transitions: the order in its new status, as GET
// /api/orders/:id returns it.
export async function changeOrderStatus(
  id: string,
  body: OrderTransitionBody,
): Promise<OrderDetail> {
  return orderDetailSchema.parse(
    await apiFetch(`/api/orders/${id}/transitions`, { method: 'POST', body }),
  );
}

// POST /api/orders/:id/cancel: the cancelled order, as GET /api/orders/:id
// returns it.
export async function cancelOrder(
  id: string,
  body: CancelOrderBody,
): Promise<OrderDetail> {
  return orderDetailSchema.parse(
    await apiFetch(`/api/orders/${id}/cancel`, { method: 'POST', body }),
  );
}
