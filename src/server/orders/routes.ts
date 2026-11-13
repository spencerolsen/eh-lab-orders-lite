import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { OrderDetail, OrderList } from '../../shared/orders';
import type { AppDeps } from '../app';
import { withQueryLog } from '../db/query';
import { NotFoundError } from '../errors';
import { parse } from '../parse';
import { getOrder, listOrders } from './repo';

// No query parameters yet (LAB-14 adds the filters and paging), so any is a 400.
const listOrdersQuery = z.strictObject({});

const orderParams = z.strictObject({ id: z.uuid() });

// GET /api/orders and GET /api/orders/:id (docs/api.md), registered by
// buildApp. Only ids and counts are ever logged, never patient detail.
export function orderRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/api/orders', async (request): Promise<OrderList> => {
    parse(listOrdersQuery, request.query);
    const items = await listOrders(
      withQueryLog(deps.pool, request.log),
      deps.clinicTimezone,
    );
    // hasMore is always false until LAB-14 adds paging.
    return { items, hasMore: false, clinicTimezone: deps.clinicTimezone };
  });

  app.get('/api/orders/:id', async (request): Promise<OrderDetail> => {
    const { id } = parse(orderParams, request.params);
    const order = await getOrder(
      withQueryLog(deps.pool, request.log),
      id,
      deps.clinicTimezone,
    );
    if (!order) {
      request.log.warn(
        { event: 'order.not_found', orderId: id },
        'Order not found',
      );
      throw new NotFoundError('There is no such order');
    }
    request.log.debug(
      { event: 'order.loaded', orderId: id, itemCount: order.items.length },
      'Order loaded',
    );
    return order;
  });
}
