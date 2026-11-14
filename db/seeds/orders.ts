// Five obviously fake orders for the seeded patients and tests (LAB-11).
//
// Each order has a fixed id and a fixed order time, so running the seed twice
// leaves the same rows. The items are copied from the catalog rows (code,
// name, price, turnaround), as placing an order does, and the ready date comes
// from estimateReadyDate with that fixed time and the clinic's time zone: it
// is never typed in by hand, and never depends on when the seed runs.
//
// Statuses: ordered, collected, completed and one cancelled, so the cancelled
// state shows on a fresh install. A cancelled row needs a note, a name and a
// time (the CHECK orders_cancellation_complete, migration 0007).
import type pg from 'pg';

import type { OrderStatus } from '../../src/shared/orders';
import { estimateReadyDate } from '../../src/server/orders/domain/ready-date';

type SeedOrder = {
  id: string;
  patientId: string;
  status: OrderStatus;
  // The moment the order was placed. The comment gives it in the default
  // clinic time zone, America/Denver.
  orderedAt: string;
  testCodes: string[];
  // Only on a cancelled order: why, who and when.
  cancellation?: { note: string; cancelledBy: string; cancelledAt: string };
};

export const SEED_ORDERS: readonly SeedOrder[] = [
  {
    // One test, placed on a Saturday: Monday 2026-11-09 is business day 1.
    id: '5eed0011-0000-4000-8000-000000000001',
    patientId: '5eed0008-0000-4000-8000-000000000001',
    status: 'ordered',
    orderedAt: '2026-11-07T18:00:00Z', // Sat 2026-11-07 11:00
    testCodes: ['CULT'],
  },
  {
    // Three tests.
    id: '5eed0011-0000-4000-8000-000000000002',
    patientId: '5eed0008-0000-4000-8000-000000000004',
    status: 'collected',
    orderedAt: '2026-11-04T21:30:00Z', // Wed 2026-11-04 14:30
    testCodes: ['CBC', 'CMP', 'VITD'],
  },
  {
    // Placed on Friday 2026-10-30 at 12:00 in the clinic.
    id: '5eed0011-0000-4000-8000-000000000003',
    patientId: '5eed0008-0000-4000-8000-000000000002',
    status: 'ordered',
    orderedAt: '2026-10-30T18:00:00Z', // Fri 2026-10-30 12:00
    testCodes: ['LIPID', 'UA'],
  },
  {
    // Completed.
    id: '5eed0011-0000-4000-8000-000000000004',
    patientId: '5eed0008-0000-4000-8000-000000000003',
    status: 'completed',
    orderedAt: '2026-10-26T16:00:00Z', // Mon 2026-10-26 10:00
    testCodes: ['CMP', 'TSH', 'A1C'],
  },
  {
    // Cancelled the day after it was placed.
    id: '5eed0011-0000-4000-8000-000000000005',
    patientId: '5eed0008-0000-4000-8000-000000000003',
    status: 'cancelled',
    orderedAt: '2026-11-03T17:00:00Z', // Tue 2026-11-03 10:00
    testCodes: ['UA'],
    cancellation: {
      note: 'Sample note',
      cancelledBy: 'Sample Staff',
      cancelledAt: '2026-11-04T16:00:00Z', // Wed 2026-11-04 09:00
    },
  },
];

type CatalogRow = {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  turnaround_days: number;
};

// Inserts the orders and items that are not there yet and returns how many
// rows (orders plus items) it inserted.
export async function seedOrders(
  client: pg.ClientBase,
  { clinicTimezone }: { clinicTimezone: string },
): Promise<number> {
  let inserted = 0;
  for (const order of SEED_ORDERS) {
    const { rows: tests } = await client.query<CatalogRow>(
      `select id, code, name, price_cents, turnaround_days
       from lab_tests where code = any($1) and is_active order by code`,
      [order.testCodes],
    );
    if (tests.length !== order.testCodes.length) {
      // Only an active test can be ordered (LAB-07), so the seed refuses one too.
      throw new Error(
        `Seed order ${order.id} names a test that is missing or inactive`,
      );
    }
    const orderedAt = new Date(order.orderedAt);
    const readyDate = estimateReadyDate(
      orderedAt,
      tests.map((test) => ({ turnaroundDays: test.turnaround_days })),
      clinicTimezone,
    );
    const result = await client.query(
      `insert into orders
         (id, patient_id, status, estimated_ready_date, created_at, updated_at,
          cancellation_note, cancelled_by, cancelled_at)
       values ($1, $2, $3, $4, $5, $5, $6, $7, $8)
       on conflict (id) do nothing`,
      [
        order.id,
        order.patientId,
        order.status,
        readyDate,
        orderedAt,
        order.cancellation?.note ?? null,
        order.cancellation?.cancelledBy ?? null,
        order.cancellation?.cancelledAt ?? null,
      ],
    );
    inserted += result.rowCount ?? 0;
    for (const test of tests) {
      const item = await client.query(
        `insert into order_items
           (order_id, lab_test_id, test_code, test_name, price_cents, turnaround_days)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (order_id, lab_test_id) do nothing`,
        [
          order.id,
          test.id,
          test.code,
          test.name,
          test.price_cents,
          test.turnaround_days,
        ],
      );
      inserted += item.rowCount ?? 0;
    }
  }
  return inserted;
}
