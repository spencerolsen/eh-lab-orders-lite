import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  cancelOrderBody,
  createOrderBody,
  createOrderHeaders,
  listOrdersQuery,
  type OrderDetail,
  type OrderList,
  type OrderQuote,
  orderTransitionBody,
  quoteOrderBody,
} from '../../shared/orders';
import type { AppDeps } from '../app';
import { withQueryLog } from '../db/query';
import { NotFoundError } from '../errors';
import { parse } from '../parse';
import { getOrder, listOrders } from './repo';
import {
  cancelOrder,
  changeOrderStatus,
  createOrder,
  quoteOrder,
} from './service';

const orderParams = z.strictObject({ id: z.uuid() });

// GET and POST /api/orders, GET /api/orders/:id, POST
// /api/orders/:id/transitions and POST /api/orders/:id/cancel (docs/api.md),
// registered
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
  // With an Idempotency-Key the browser already used, nothing is created: 200
  // with the order that key placed (LAB-18).
  app.post('/api/orders', async (request, reply) => {
    const headers = parse(createOrderHeaders, request.headers);
    const body = parse(createOrderBody, request.body);
    const idempotencyKey = headers['idempotency-key'] ?? null;
    const result = await createOrder(deps, request.log, body, idempotencyKey);
    if (result.replayed) {
      // The key is a random id made by the browser, not patient data.
      request.log.warn(
        {
          event: 'order.create_replayed',
          orderId: result.order.id,
          idempotencyKey,
        },
        'Order create replayed',
      );
      return reply.code(200).send(result.order);
    }
    request.log.info(
      {
        event: 'order.created',
        orderId: result.order.id,
        patientId: result.order.patient.id,
        itemCount: result.itemCount,
      },
      'Order created',
    );
    return reply.code(201).send(result.order);
  });

  // POST /api/orders/quote: 200 with the items, total and ready date an order
  // of these tests would have now. Saves nothing and takes no patient. The
  // ready-date debug line is the only log (ids and counts); a refusal is
  // logged at warn by the error handler.
  app.post('/api/orders/quote', async (request): Promise<OrderQuote> => {
    const body = parse(quoteOrderBody, request.body);
    return quoteOrder(deps, request.log, body);
  });

  // POST /api/orders/:id/transitions: 200 with the order in its new status.
  // The service logs the change (info) or the refusal (warn); the error
  // handler turns its 404, 422 or 409 into the response.
  app.post(
    '/api/orders/:id/transitions',
    async (request): Promise<OrderDetail> => {
      const { id } = parse(orderParams, request.params);
      const body = parse(orderTransitionBody, request.body);
      return changeOrderStatus(deps, request.log, id, body);
    },
  );

  // POST /api/orders/:id/cancel: 200 with the cancelled order. The same flow
  // and answers as a transition; the service logs ids and statuses only,
  // never the note or the name.
  app.post('/api/orders/:id/cancel', async (request): Promise<OrderDetail> => {
    const { id } = parse(orderParams, request.params);
    const body = parse(cancelOrderBody, request.body);
    return cancelOrder(deps, request.log, id, body);
  });
}
