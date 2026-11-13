// Six obviously fake patients: made-up names, the reserved example.test email
// domain and US phone numbers in the fictional 555-0100 to 555-0199 range. Fixed ids and `on conflict (id) do
// nothing`, so running the seed twice leaves the same rows.
import type pg from 'pg';

type SeedPatient = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string | null;
  phone: string | null;
};

export const SEED_PATIENTS: readonly SeedPatient[] = [
  {
    id: '5eed0008-0000-4000-8000-000000000001',
    firstName: 'Test',
    lastName: 'Patient',
    dateOfBirth: '1984-03-09',
    email: 'test.patient@example.test',
    phone: '8015550100',
  },
  {
    id: '5eed0008-0000-4000-8000-000000000002',
    firstName: 'Sample',
    lastName: 'Person',
    dateOfBirth: '1990-12-31',
    email: 'sample.person@example.test',
    phone: null,
  },
  {
    id: '5eed0008-0000-4000-8000-000000000003',
    firstName: 'Demo',
    lastName: 'Example',
    dateOfBirth: '2020-02-29',
    email: null,
    phone: '8015550101',
  },
  {
    id: '5eed0008-0000-4000-8000-000000000004',
    firstName: 'Fake',
    lastName: 'Tester',
    dateOfBirth: '1975-07-04',
    email: 'fake.tester@example.test',
    phone: '8015550102',
  },
  {
    id: '5eed0008-0000-4000-8000-000000000005',
    firstName: 'Mock',
    lastName: 'Record',
    dateOfBirth: '2001-01-01',
    email: null,
    phone: '8015550103',
  },
  {
    id: '5eed0008-0000-4000-8000-000000000006',
    firstName: 'Another',
    lastName: 'Sample',
    dateOfBirth: '1968-10-15',
    email: 'another.sample@example.test',
    phone: '8015550104',
  },
];

// Inserts the rows one statement each and returns how many were new (0 when
// they are all there already).
export async function seedPatients(client: pg.ClientBase): Promise<number> {
  let inserted = 0;
  for (const patient of SEED_PATIENTS) {
    const result = await client.query(
      `insert into patients (id, first_name, last_name, date_of_birth, email, phone)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do nothing`,
      [
        patient.id,
        patient.firstName,
        patient.lastName,
        patient.dateOfBirth,
        patient.email,
        patient.phone,
      ],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}
