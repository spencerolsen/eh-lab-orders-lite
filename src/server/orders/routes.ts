import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { OrderList } from '../../shared/orders';
import type { AppDeps } from '../app';
import { withQueryLog } from '../db/query';
import { parse } from '../parse';
import { listOrders } from './repo';

// No query parameters yet (LAB-14 adds the filters and paging), so any is a 400.
const listOrdersQuery = z.strictObject({});

// GET /api/orders (docs/api.md), registered by buildApp. Listing logs nothing
// beyond the request line: no patient detail is ever logged.
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
}
