// The patients service with a fake database, for the one thing the real
// database cannot show: the candidate query only proposes rows, and the pure
// rule (matchRules) decides. With the real query both always agree, so this
// fakes a candidate row the rule does not match. All values are fake.
import pino from 'pino';
import { describe, expect, it } from 'vitest';

import type pg from 'pg';

import type { Db } from '../db/query';
import { createPatient } from './service';

const body = {
  firstName: 'Test',
  lastName: 'Person',
  dateOfBirth: '1984-03-09',
  email: 'test.person@example.test',
  phone: undefined,
};

const row = (fields: Record<string, unknown>) => ({
  id: 'p1',
  first_name: 'Other',
  last_name: 'Sample',
  date_of_birth: '1990-01-01',
  email: 'other.sample@example.test',
  phone: '8015550199',
  ...fields,
});

// Answers the candidate select with `candidates` and an insert with the body.
function fakeDb(candidates: Record<string, unknown>[]) {
  const statements: string[] = [];
  const db: Db = {
    query<R extends pg.QueryResultRow>(text: string) {
      statements.push(text.trim().split(/\s+/)[0]!);
      const rows = text.trim().startsWith('insert')
        ? [row({ id: 'new', first_name: 'Test', last_name: 'Person' })]
        : candidates;
      return Promise.resolve({ rows } as unknown as pg.QueryResult<R>);
    },
  };
  return { db, statements };
}

const silent = pino({ level: 'silent' });

describe('createPatient', () => {
  it('creates the patient when no candidate row matches by the rule', async () => {
    const { db, statements } = fakeDb([row({})]);
    const patient = await createPatient(db, silent, body);
    expect(patient.id).toBe('new');
    expect(statements).toEqual(['select', 'insert']);
  });

  it('refuses with the rows the rule matches, and only those', async () => {
    const { db, statements } = fakeDb([
      row({ id: 'match', email: body.email }),
      row({ id: 'no-match' }),
    ]);
    await expect(createPatient(db, silent, body)).rejects.toMatchObject({
      code: 'POSSIBLE_DUPLICATE',
      matches: [{ id: 'match' }],
    });
    expect(statements).toEqual(['select']);
  });
});
