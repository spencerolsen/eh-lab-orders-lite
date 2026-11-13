// The SQL for patients. Values are always bound parameters.
import pg from 'pg';

import {
  CONTACT_REQUIRED_REASONS,
  type CreatePatientBody,
  type Patient,
  SEARCH_RESULT_LIMIT,
  type UpdatePatientBody,
} from '../../shared/patients';
import { escapeLike } from '../db/like';
import type { Db } from '../db/query';
import { BusinessRuleError } from '../errors';

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

// By last name, then first name, ignoring case; the id breaks ties, so the
// order is the same on every call.
const ORDER_BY = 'order by lower(last_name), lower(first_name), id';

// Every patient.
export async function listPatients(db: Db): Promise<Patient[]> {
  const { rows } = await db.query<PatientRow>(
    `select ${COLUMNS} from patients ${ORDER_BY}`,
  );
  return rows.map(toPatient);
}

// The patients whose "first last" name contains `text`, ignoring case, in the
// list's order, at most SEARCH_RESULT_LIMIT. A first or a last name on its own
// is part of "first last", so one condition covers all three. `text` is a
// bound parameter, with %, _ and \ escaped so they match only themselves.
// No index: a leading % cannot use a b-tree index, and a clinic's patients
// are few enough to scan.
export async function searchPatients(db: Db, text: string): Promise<Patient[]> {
  const { rows } = await db.query<PatientRow>(
    `select ${COLUMNS} from patients
     where (first_name || ' ' || last_name) ilike $1 escape '\\'
     ${ORDER_BY}
     limit $2`,
    [`%${escapeLike(text)}%`, SEARCH_RESULT_LIMIT],
  );
  return rows.map(toPatient);
}

// One patient, or undefined when the id does not exist.
export async function findPatient(
  db: Db,
  id: string,
): Promise<Patient | undefined> {
  const { rows } = await db.query<PatientRow>(
    `select ${COLUMNS} from patients where id = $1`,
    [id],
  );
  return rows[0] && toPatient(rows[0]);
}

// The column each update field writes. Column names come only from here,
// never from the request.
const UPDATE_COLUMNS = {
  firstName: 'first_name',
  lastName: 'last_name',
  dateOfBirth: 'date_of_birth',
  email: 'email',
  phone: 'phone',
} as const satisfies Record<keyof UpdatePatientBody, string>;

const CHECK_VIOLATION = '23514';

// Sets the fields in `changes` (null removes an email or phone) and
// updated_at, in one UPDATE ... RETURNING. Returns undefined when the id does
// not exist. There is no read first: if the change would leave the patient
// with neither email nor phone, the database's patients_contact_required
// check refuses the row, nothing is changed, and this throws a 422.
export async function updatePatient(
  db: Db,
  id: string,
  changes: UpdatePatientBody,
): Promise<Patient | undefined> {
  const fields = (
    Object.keys(UPDATE_COLUMNS) as (keyof UpdatePatientBody)[]
  ).filter((field) => changes[field] !== undefined);
  const assignments = fields.map(
    (field, index) => `${UPDATE_COLUMNS[field]} = $${index + 2}`,
  );
  try {
    const { rows } = await db.query<PatientRow>(
      `update patients
       set ${[...assignments, 'updated_at = now()'].join(', ')}
       where id = $1
       returning ${COLUMNS}`,
      [id, ...fields.map((field) => changes[field])],
    );
    return rows[0] && toPatient(rows[0]);
  } catch (error) {
    if (
      error instanceof pg.DatabaseError &&
      error.code === CHECK_VIOLATION &&
      error.constraint === 'patients_contact_required'
    ) {
      throw new BusinessRuleError(
        'CONTACT_REQUIRED',
        'A patient needs an email or a phone number',
        [
          { field: 'email', reason: CONTACT_REQUIRED_REASONS.email },
          { field: 'phone', reason: CONTACT_REQUIRED_REASONS.phone },
        ],
      );
    }
    throw error;
  }
}
