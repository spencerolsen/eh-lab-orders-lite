// The SQL for the lab test catalog. Queries live here and nowhere else.
import type {
  CreateLabTestBody,
  LabTest,
  UpdateLabTestBody,
} from '../../shared/lab-tests';
import { labTestSchema } from '../../shared/lab-tests';
import type { Db } from '../db/query';
import { ConflictError } from '../errors';

// The name given to the unique constraint on code in 0002_lab_tests.sql.
const CODE_UNIQUE_CONSTRAINT = 'lab_tests_code_key';
// Postgres's SQLSTATE for a unique violation.
const UNIQUE_VIOLATION = '23505';

const COLUMNS =
  'id, code, name, price_cents, turnaround_days, is_active' as const;

export type LabTestRow = {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  turnaround_days: number;
  is_active: boolean;
};

// Turns a row into the API's shape. The result is checked with the shared
// schema, so a missing or mistyped column throws here (and the request is a
// 500) instead of sending an incomplete test to the browser.
export function toLabTest(row: LabTestRow): LabTest {
  return labTestSchema.parse({
    id: row.id,
    code: row.code,
    name: row.name,
    priceCents: row.price_cents,
    turnaroundDays: row.turnaround_days,
    isActive: row.is_active,
  });
}

// Every test, active or not, sorted by code.
export async function listLabTests(db: Db): Promise<LabTest[]> {
  const { rows } = await db.query<LabTestRow>(
    `select ${COLUMNS} from lab_tests order by code`,
  );
  return rows.map(toLabTest);
}

function isCodeTaken(error: unknown): boolean {
  const { code, constraint } = (error ?? {}) as {
    code?: unknown;
    constraint?: unknown;
  };
  return code === UNIQUE_VIOLATION && constraint === CODE_UNIQUE_CONSTRAINT;
}

// Inserts a new, active test. A code that already exists is found by the
// database's unique constraint, not by a select first: two requests at the
// same moment would both pass a select, but only one insert can succeed.
export async function createLabTest(
  db: Db,
  input: CreateLabTestBody,
): Promise<LabTest> {
  try {
    const { rows } = await db.query<LabTestRow>(
      `insert into lab_tests (code, name, price_cents, turnaround_days)
       values ($1, $2, $3, $4)
       returning ${COLUMNS}`,
      [input.code, input.name, input.priceCents, input.turnaroundDays],
    );
    return toLabTest(rows[0] as LabTestRow);
  } catch (error) {
    if (isCodeTaken(error)) {
      throw new ConflictError(
        'DUPLICATE_TEST_CODE',
        'This code already exists',
      );
    }
    throw error;
  }
}

// Changes the fields in `changes` and leaves the others as they are. Returns
// the updated test and whether it was active before, or null when no test has
// this id.
//
// One statement, so there is no read-then-write gap. The `old` step locks the
// row (for update) and reads is_active as it was just before this change, so
// the caller can tell whether the test was activated or deactivated. A field
// left out is passed as null and kept by coalesce; no column is nullable, so
// null never means "clear it". There is no trigger, so updated_at is set here.
// Two people saving the same test: the last save wins (docs/plan/backlog.md).
export async function updateLabTest(
  db: Db,
  id: string,
  changes: UpdateLabTestBody,
): Promise<{ labTest: LabTest; wasActive: boolean } | null> {
  const { rows } = await db.query<LabTestRow & { was_active: boolean }>(
    `with old as (
       select id, is_active from lab_tests where id = $1 for update
     )
     update lab_tests t set
       name = coalesce($2, t.name),
       price_cents = coalesce($3, t.price_cents),
       turnaround_days = coalesce($4, t.turnaround_days),
       is_active = coalesce($5, t.is_active),
       updated_at = now()
     from old
     where t.id = old.id
     returning t.id, t.code, t.name, t.price_cents, t.turnaround_days,
       t.is_active, old.is_active as was_active`,
    [
      id,
      changes.name ?? null,
      changes.priceCents ?? null,
      changes.turnaroundDays ?? null,
      changes.isActive ?? null,
    ],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return { labTest: toLabTest(row), wasActive: row.was_active };
}
