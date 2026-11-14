// Rows for the orders integration tests, written with plain SQL so a test sets
// up exactly the state it needs. Every name is obviously fake.
import type pg from 'pg';

export const PATIENT_A = '20000000-0000-4000-8000-000000000001';
export const PATIENT_B = '20000000-0000-4000-8000-000000000002';
export const TEST_CBC = '30000000-0000-4000-8000-000000000001';
export const TEST_LIPID = '30000000-0000-4000-8000-000000000002';
export const TEST_CULT = '30000000-0000-4000-8000-000000000003';

export async function insertCatalogAndPatients(pool: pg.Pool): Promise<void> {
  await pool.query(
    `insert into patients (id, first_name, last_name, date_of_birth, email)
     values ($1, 'Alpha', 'Fixture', '1984-03-09', 'alpha@example.test'),
            ($2, 'Beta', 'Fixture', '1990-12-31', 'beta@example.test')`,
    [PATIENT_A, PATIENT_B],
  );
  await pool.query(
    `insert into lab_tests (id, code, name, price_cents, turnaround_days)
     values ($1, 'CBC', 'Complete Blood Count', 2500, 1),
            ($2, 'LIPID', 'Lipid Panel', 3800, 2),
            ($3, 'CULT', 'Bacterial Culture', 5250, 5)`,
    [TEST_CBC, TEST_LIPID, TEST_CULT],
  );
}

export type FixtureItem = {
  labTestId: string;
  code: string;
  priceCents: number;
  turnaroundDays: number;
};

export const CBC: FixtureItem = {
  labTestId: TEST_CBC,
  code: 'CBC',
  priceCents: 2500,
  turnaroundDays: 1,
};
export const LIPID: FixtureItem = {
  labTestId: TEST_LIPID,
  code: 'LIPID',
  priceCents: 3800,
  turnaroundDays: 2,
};
export const CULT: FixtureItem = {
  labTestId: TEST_CULT,
  code: 'CULT',
  priceCents: 5250,
  turnaroundDays: 5,
};

// What insertOrder stores on a cancelled order.
export const FIXTURE_CANCELLATION = {
  note: 'Fixture cancel note',
  cancelledBy: 'Fixture Staff',
};

// One order with its items. The ready date is any fixed date: these tests
// check what the list returns, not how the date was worked out.
export async function insertOrder(
  pool: pg.Pool,
  order: {
    id: string;
    patientId?: string;
    createdAt: string;
    status?: string;
    readyDate?: string;
    items: FixtureItem[];
  },
): Promise<void> {
  // A cancelled order must have a note, a name and a time (the CHECK
  // orders_cancellation_complete, migration 0007), so one is given here.
  const cancelled = order.status === 'cancelled';
  await pool.query(
    `insert into orders (id, patient_id, status, estimated_ready_date, created_at, updated_at,
                         cancellation_note, cancelled_by, cancelled_at)
     values ($1, $2, $3, $4, $5, $5, $6, $7, $8)`,
    [
      order.id,
      order.patientId ?? PATIENT_A,
      order.status ?? 'ordered',
      order.readyDate ?? '2026-11-20',
      order.createdAt,
      cancelled ? FIXTURE_CANCELLATION.note : null,
      cancelled ? FIXTURE_CANCELLATION.cancelledBy : null,
      cancelled ? order.createdAt : null,
    ],
  );
  for (const item of order.items) {
    await pool.query(
      `insert into order_items (order_id, lab_test_id, test_code, test_name, price_cents, turnaround_days)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        order.id,
        item.labTestId,
        item.code,
        `${item.code} name`,
        item.priceCents,
        item.turnaroundDays,
      ],
    );
  }
}
