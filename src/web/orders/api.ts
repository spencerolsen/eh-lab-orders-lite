// The order requests the pages make, each checked with the shared schema.
import {
  type OrderDetail,
  orderDetailSchema,
  type OrderList,
  orderListSchema,
} from '../../shared/orders';
import { apiFetch } from '../api/client';

// The TanStack Query key of the order list; placing an order (LAB-12) and
// changing a status (LAB-16) refresh it.
export const ORDERS_KEY = ['orders'] as const;

export async function fetchOrders(signal?: AbortSignal): Promise<OrderList> {
  return orderListSchema.parse(await apiFetch('/api/orders', { signal }));
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
