import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  createOrderBody,
  listOrdersQuery,
  type OrderDetail,
  type OrderList,
  type OrderQuote,
  quoteOrderBody,
} from '../../shared/orders';
import type { AppDeps } from '../app';
import { withQueryLog } from '../db/query';
import { NotFoundError } from '../errors';
import { parse } from '../parse';
import { getOrder, listOrders } from './repo';
import { createOrder, quoteOrder } from './service';

const orderParams = z.strictObject({ id: z.uuid() });

// GET and POST /api/orders and GET /api/orders/:id (docs/api.md), registered
// by buildApp. Only ids and counts are logged: never a name, a date of birth
// or a test name.
export function orderRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/api/orders', async (request): Promise<OrderList> => {
    const query = parse(listOrdersQuery, request.query);
    const { items, hasMore } = await listOrders(
      withQueryLog(deps.pool, request.log),
      deps.clinicTimezone,
      query,
    );
    // Which filters were used, by name, and how many rows came back: never
    // a value.
    request.log.debug(
      {
        event: 'orders.listed',
        filters: (['status', 'patientId'] as const).filter(
          (name) => query[name] !== undefined,
        ),
        rowCount: items.length,
        hasMore,
      },
      'Orders listed',
    );
    return { items, hasMore, clinicTimezone: deps.clinicTimezone };
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

  // POST /api/orders: 201 with the new order as a list row. A refusal (400,
  // 422) is logged at warn by the error handler, with its code and a count.
  app.post('/api/orders', async (request, reply) => {
    const body = parse(createOrderBody, request.body);
    const { order, itemCount } = await createOrder(deps, request.log, body);
    request.log.info(
      {
        event: 'order.created',
        orderId: order.id,
        patientId: order.patient.id,
        itemCount,
      },
      'Order created',
    );
    return reply.code(201).send(order);
  });

  // POST /api/orders/quote: 200 with the items, total and ready date an order
  // of these tests would have now. Saves nothing and takes no patient. The
  // ready-date debug line is the only log (ids and counts); a refusal is
  // logged at warn by the error handler.
  app.post('/api/orders/quote', async (request): Promise<OrderQuote> => {
    const body = parse(quoteOrderBody, request.body);
    return quoteOrder(deps, request.log, body);
  });
}
