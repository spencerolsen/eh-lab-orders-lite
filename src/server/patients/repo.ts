// The SQL for patients. Values are always bound parameters.
import type { CreatePatientBody, Patient } from '../../shared/patients';
import type { Db } from '../db/query';

type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  // A DATE column, read as the 'YYYY-MM-DD' string (src/server/db/types.ts).
  date_of_birth: string;
  email: string | null;
  phone: string | null;
};

const COLUMNS = 'id, first_name, last_name, date_of_birth, email, phone';

function toPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    email: row.email,
    phone: row.phone,
  };
}

// `input` has been parsed by the shared schema, so it is trimmed and
// normalized; an absent email or phone is stored as null.
export async function insertPatient(
  db: Db,
  input: CreatePatientBody,
): Promise<Patient> {
  const { rows } = await db.query<PatientRow>(
    `insert into patients (first_name, last_name, date_of_birth, email, phone)
     values ($1, $2, $3, $4, $5)
     returning ${COLUMNS}`,
    [
      input.firstName,
      input.lastName,
      input.dateOfBirth,
      input.email ?? null,
      input.phone ?? null,
    ],
  );
  return toPatient(rows[0]!);
}

// Every patient, by last name, then first name, ignoring case; the id breaks
// ties, so the order is the same on every call.
export async function listPatients(db: Db): Promise<Patient[]> {
  const { rows } = await db.query<PatientRow>(
    `select ${COLUMNS} from patients
     order by lower(last_name), lower(first_name), id`,
  );
  return rows.map(toPatient);
}
