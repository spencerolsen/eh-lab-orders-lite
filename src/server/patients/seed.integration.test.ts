// The patient seed (db/seeds/patients.ts), run twice on the test database.
import { expect, it } from 'vitest';

import { SEED_PATIENTS, seedPatients } from '../../../db/seeds/patients';
import { closePool } from '../db/pool';
import { createTestPool } from '../testing/harness';

it('seeding twice leaves the same 6 patients', async () => {
  const pool = createTestPool();
  const client = await pool.connect();
  try {
    await client.query('truncate table patients');
    const read = async () =>
      (
        await client.query<{ id: string }>(
          'select id, first_name, last_name, date_of_birth, email, phone, created_at from patients order by id',
        )
      ).rows;

    expect(await seedPatients(client)).toBe(6);
    const first = await read();
    expect(await seedPatients(client)).toBe(0);
    expect(await read()).toEqual(first);
    expect(first.map((row) => row.id)).toEqual(
      SEED_PATIENTS.map((patient) => patient.id),
    );
  } finally {
    client.release();
    await closePool(pool);
  }
});
