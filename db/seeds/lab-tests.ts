// The 8 sample lab tests (LAB-06). Codes are the usual lab abbreviations;
// prices are made up. Each row has a fixed id and is inserted with
// `on conflict (id) do nothing`, so running the seed twice leaves the same rows.
import type pg from 'pg';

const LAB_TESTS = [
  [
    '10000000-0000-4000-8000-000000000001',
    'CBC',
    'Complete Blood Count',
    2500,
    1,
  ],
  [
    '10000000-0000-4000-8000-000000000002',
    'CMP',
    'Comprehensive Metabolic Panel',
    4200,
    1,
  ],
  ['10000000-0000-4000-8000-000000000003', 'LIPID', 'Lipid Panel', 3800, 2],
  ['10000000-0000-4000-8000-000000000004', 'A1C', 'Hemoglobin A1c', 3550, 2],
  [
    '10000000-0000-4000-8000-000000000005',
    'TSH',
    'Thyroid Stimulating Hormone',
    4500,
    2,
  ],
  ['10000000-0000-4000-8000-000000000006', 'UA', 'Urinalysis', 1800, 1],
  [
    '10000000-0000-4000-8000-000000000007',
    'VITD',
    'Vitamin D, 25-Hydroxy',
    6500,
    3,
  ],
  [
    '10000000-0000-4000-8000-000000000008',
    'CULT',
    'Bacterial Culture',
    5250,
    5,
  ],
] as const;

// Inserts the rows that are not there yet and returns how many it inserted.
export async function seedLabTests(client: pg.ClientBase): Promise<number> {
  let inserted = 0;
  for (const [id, code, name, priceCents, turnaroundDays] of LAB_TESTS) {
    const result = await client.query(
      `insert into lab_tests (id, code, name, price_cents, turnaround_days)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do nothing`,
      [id, code, name, priceCents, turnaroundDays],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}
