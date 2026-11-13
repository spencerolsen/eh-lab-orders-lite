// GET /api/orders/:id through the app, on the test database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type OrderDetail, orderDetailSchema } from '../../shared/orders';
import {
  startTestApp,
  type TestApp,
  truncateAllTables,
} from '../testing/harness';
import {
  CBC,
  insertCatalogAndPatients,
  insertOrder,
  LIPID,
  PATIENT_B,
} from './fixtures';

let t: TestApp;

const ORDER_ID = '40000000-0000-4000-8000-000000000001';

beforeAll(() => {
  t = startTestApp();
});

beforeEach(async () => {
  await truncateAllTables(t.pool);
  await insertCatalogAndPatients(t.pool);
});

afterAll(async () => {
  await t.close();
});

describe('GET /api/orders/:id', () => {
  it('returns the order with its patient, items, clock fields and actions', async () => {
    await insertOrder(t.pool, {
      id: ORDER_ID,
      patientId: PATIENT_B,
      createdAt: '2026-10-30T18:00:00Z',
      status: 'collected',
      readyDate: '2026-11-03',
      items: [LIPID, CBC],
    });
    const response = await t.inject({
      method: 'GET',
      url: `/api/orders/${ORDER_ID}`,
    });
    expect(response.statusCode).toBe(200);
    const order = orderDetailSchema.parse(response.json());
    expect(order).toEqual({
      id: ORDER_ID,
      status: 'collected',
      patient: {
        id: PATIENT_B,
        firstName: 'Beta',
        lastName: 'Fixture',
        dateOfBirth: '1990-12-31',
        email: 'beta@example.test',
        phone: null,
      },
      // From the order_items columns (the fixture names each item "<code> name"),
      // not from the catalog's "Complete Blood Count" and "Lipid Panel".
      items: [
        {
          labTestId: CBC.labTestId,
          testCode: 'CBC',
          testName: 'CBC name',
          priceCents: 2500,
          turnaroundDays: 1,
        },
        {
          labTestId: LIPID.labTestId,
          testCode: 'LIPID',
          testName: 'LIPID name',
          priceCents: 3800,
          turnaroundDays: 2,
        },
      ],
      totalCents: 6300,
      estimatedReadyDate: '2026-11-03',
      createdAt: '2026-10-30T18:00:00.000Z',
      createdAtClinic: '2026-10-30 12:00',
      clinicTimezone: 'America/Denver',
      allowedNextStatuses: ['completed'],
      canCancel: true,
    });
  });

  it('returns 404 NOT_FOUND for a well-formed id with no order', async () => {
    const response = await t.inject({
      method: 'GET',
      url: '/api/orders/40000000-0000-4000-8000-0000000000ff',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'NOT_FOUND',
    );
  });

  it('returns 400 VALIDATION_ERROR for an id that is not a uuid', async () => {
    const response = await t.inject({
      method: 'GET',
      url: '/api/orders/not-a-uuid',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('returns an order with no items as an empty list and total 0', async () => {
    await insertOrder(t.pool, {
      id: ORDER_ID,
      createdAt: '2026-10-30T18:00:00Z',
      items: [],
    });
    const response = await t.inject({
      method: 'GET',
      url: `/api/orders/${ORDER_ID}`,
    });
    const order: OrderDetail = response.json();
    expect(order.items).toEqual([]);
    expect(order.totalCents).toBe(0);
  });
});
