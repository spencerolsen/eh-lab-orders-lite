// The duplicate warning on POST /api/patients (LAB-10), on the test database:
// the candidate query, the 409 and its matches, Create anyway, what wins over
// the check, edits, and the logs. All values are fake.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ErrorBody } from '../../shared/api-error';
import type { CreatePatientBody, Patient } from '../../shared/patients';
import { startTestApp, type TestApp } from '../testing/harness';
import { findDuplicateCandidates } from './repo';

let t: TestApp;

beforeEach(async () => {
  t = startTestApp();
  await t.pool.query('truncate table patients cascade');
});

afterEach(async () => {
  await t.close();
});

// The stored patient most tests match against.
const stored = {
  firstName: 'Test',
  lastName: 'Person',
  dateOfBirth: '1984-03-09',
  email: 'test.person@example.test',
  phone: '8015550100',
};

// A new patient that shares nothing with `stored`.
const unrelated = {
  firstName: 'Other',
  lastName: 'Sample',
  dateOfBirth: '1990-01-01',
  email: 'other.sample@example.test',
  phone: '(801) 555-0199',
};

// Stores a patient with SQL, so the setup itself writes no log line.
async function insert(patient: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string | null;
  phone: string | null;
}): Promise<string> {
  const { rows } = await t.pool.query<{ id: string }>(
    `insert into patients (first_name, last_name, date_of_birth, email, phone)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      patient.firstName,
      patient.lastName,
      patient.dateOfBirth,
      patient.email,
      patient.phone,
    ],
  );
  return rows[0]!.id;
}

async function post(body: Record<string, unknown>) {
  return t.inject({ method: 'POST', url: '/api/patients', payload: body });
}

async function patientCount(): Promise<number> {
  const { rows } = await t.pool.query<{ count: string }>(
    'select count(*) from patients',
  );
  return Number(rows[0]!.count);
}

function errorOf(response: { json: <T>() => T }): ErrorBody['error'] {
  return response.json<ErrorBody>().error;
}

function matchIds(response: { json: <T>() => T }): string[] {
  return (errorOf(response).matches ?? []).map((match) => match.id);
}

describe('findDuplicateCandidates (the candidate query)', () => {
  const candidate = (
    fields: Partial<CreatePatientBody>,
  ): CreatePatientBody => ({
    firstName: 'Other',
    lastName: 'Sample',
    dateOfBirth: '1990-01-01',
    email: undefined,
    phone: undefined,
    ...fields,
  });

  it('finds the same email in another letter case', async () => {
    const id = await insert(stored);
    const found = await findDuplicateCandidates(
      t.pool,
      candidate({ email: 'TEST.PERSON@example.test' }),
    );
    expect(found.map((patient) => patient.id)).toEqual([id]);
  });

  it('finds the same phone as the stored 10 digits', async () => {
    const id = await insert(stored);
    const found = await findDuplicateCandidates(
      t.pool,
      candidate({ phone: '8015550100' }),
    );
    expect(found.map((patient) => patient.id)).toEqual([id]);
  });

  it('finds the same name in another letter case with the same date of birth', async () => {
    const id = await insert(stored);
    const found = await findDuplicateCandidates(
      t.pool,
      candidate({
        firstName: 'TEST',
        lastName: 'person',
        dateOfBirth: '1984-03-09',
      }),
    );
    expect(found.map((patient) => patient.id)).toEqual([id]);
  });

  it('finds nothing for a missing email and phone against patients without one', async () => {
    await insert({ ...stored, email: null });
    await insert({ ...stored, firstName: 'Third', phone: null });
    expect(await findDuplicateCandidates(t.pool, candidate({}))).toEqual([]);
  });

  it('finds nothing for the same name with another date of birth, or the last name alone', async () => {
    await insert(stored);
    expect(
      await findDuplicateCandidates(
        t.pool,
        candidate({ firstName: 'Test', lastName: 'Person' }),
      ),
    ).toEqual([]);
    expect(
      await findDuplicateCandidates(
        t.pool,
        candidate({ lastName: 'Person', dateOfBirth: '1984-03-09' }),
      ),
    ).toEqual([]);
  });
});

describe('POST /api/patients with a likely duplicate', () => {
  it('returns 409 POSSIBLE_DUPLICATE with the match, and creates nothing', async () => {
    const id = await insert(stored);
    const response = await post({
      ...unrelated,
      email: 'TEST.Person@Example.test ',
    });
    expect(response.statusCode).toBe(409);
    const error = errorOf(response);
    expect(error).toEqual({
      code: 'POSSIBLE_DUPLICATE',
      message:
        'This patient may already exist. Open the existing patient, or create a new one anyway.',
      matches: [{ id, ...stored }],
      requestId: response.headers['x-request-id'],
    });
    // Exactly these fields, nothing more about the stored patient.
    expect(Object.keys(error.matches![0]!).sort()).toEqual(
      ['dateOfBirth', 'email', 'firstName', 'id', 'lastName', 'phone'].sort(),
    );
    expect(await patientCount()).toBe(1);
  });

  it('matches a phone typed as (801) 555-0100', async () => {
    const id = await insert(stored);
    const response = await post({
      ...unrelated,
      email: undefined,
      phone: '(801) 555-0100',
    });
    expect(response.statusCode).toBe(409);
    expect(matchIds(response)).toEqual([id]);
  });

  it('matches the same name and date of birth in any letter case', async () => {
    const id = await insert(stored);
    const response = await post({
      ...unrelated,
      firstName: ' test ',
      lastName: 'PERSON',
      dateOfBirth: '1984-03-09',
    });
    expect(response.statusCode).toBe(409);
    expect(matchIds(response)).toEqual([id]);
  });

  it.each([
    ['the same name with another date of birth', { dateOfBirth: '1984-03-10' }],
    ['the same last name only', { firstName: 'Other' }],
    ['Jon against John', { firstName: 'Jon' }],
  ])('creates the patient for %s', async (_name, change) => {
    await insert({ ...stored, firstName: 'John' });
    const response = await post({
      ...unrelated,
      firstName: 'John',
      lastName: 'Person',
      dateOfBirth: '1984-03-09',
      ...change,
    });
    expect(response.statusCode).toBe(201);
    expect(await patientCount()).toBe(2);
  });

  it('lists patients that match by different rules, each once, by last then first name', async () => {
    const byEmail = await insert({
      ...stored,
      firstName: 'Bea',
      lastName: 'Zulu',
      phone: '8015550111',
    });
    const byPhone = await insert({
      ...stored,
      firstName: 'Abe',
      lastName: 'Zulu',
      email: 'abe.zulu@example.test',
      phone: '8015550199',
    });
    // Matches by email and by name with date of birth: listed once.
    const byTwo = await insert({
      ...unrelated,
      email: 'test.person@example.test',
      phone: null,
    });
    await insert({
      ...stored,
      firstName: 'Nobody',
      email: 'nobody@example.test',
      phone: '8015550122',
    });
    const response = await post({ ...unrelated, email: stored.email });
    expect(response.statusCode).toBe(409);
    expect(matchIds(response)).toEqual([byTwo, byPhone, byEmail]);
  });

  it('lists at most 10 matches', async () => {
    for (let index = 0; index < 12; index += 1) {
      await insert({
        ...stored,
        firstName: `First${String(index).padStart(2, '0')}`,
        email: null,
      });
    }
    const response = await post({ ...unrelated, phone: stored.phone });
    expect(response.statusCode).toBe(409);
    const matches = errorOf(response).matches!;
    expect(matches).toHaveLength(10);
    expect(matches.map((match) => match.firstName)).toEqual(
      Array.from(
        { length: 10 },
        (_, index) => `First${String(index).padStart(2, '0')}`,
      ),
    );
    // The log counts every match, not only the ten listed.
    expect(
      t.logs().find((line) => line.event === 'patient.possible_duplicate'),
    ).toMatchObject({ matchCount: 12 });
  });

  // Postgres lower('İlker') is 'ilker', JavaScript's is 'i̇lker' (with a
  // combining dot), so the query proposes these ten rows and matchRules
  // rejects them. The real match sorts after them and must still be found:
  // the limit applies after the rule, never in the query. (On a database
  // whose lower() leaves İ alone, the ten rows are never proposed, and the
  // test passes for that reason.)
  it('a match sorted after ten rows the rule rejects is still found', async () => {
    for (let index = 0; index < 10; index += 1) {
      await insert({
        firstName: 'ilker',
        lastName: 'Aaa',
        dateOfBirth: '1980-05-05',
        email: `ilker.${index}@example.test`,
        phone: null,
      });
    }
    const zed = await insert({
      firstName: 'Zed',
      lastName: 'Zzz',
      dateOfBirth: '1970-01-01',
      email: null,
      phone: '8015550300',
    });
    const response = await post({
      firstName: 'İlker',
      lastName: 'Aaa',
      dateOfBirth: '1980-05-05',
      phone: '(801) 555-0300',
    });
    expect(response.statusCode).toBe(409);
    expect(matchIds(response)).toEqual([zed]);
    expect(await patientCount()).toBe(11);
  });

  it('runs the check when confirmDuplicate is false', async () => {
    await insert(stored);
    const response = await post({ ...stored, confirmDuplicate: false });
    expect(response.statusCode).toBe(409);
    expect(await patientCount()).toBe(1);
  });
});

describe('Create anyway (confirmDuplicate: true)', () => {
  it('creates the patient, and the flag is not stored or returned', async () => {
    const id = await insert(stored);
    const response = await post({ ...stored, confirmDuplicate: true });
    expect(response.statusCode).toBe(201);
    const created = response.json<Patient>();
    expect(created).toEqual({ id: created.id, ...stored });
    expect(created.id).not.toBe(id);
    expect(await patientCount()).toBe(2);
    const { rows } = await t.pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'patients' and column_name ilike '%confirm%'`,
    );
    expect(rows).toEqual([]);
  });

  it('never reports a patient as a duplicate of itself: each existing one is listed once', async () => {
    const first = await post(stored);
    expect(first.statusCode).toBe(201);
    const firstId = first.json<Patient>().id;

    const second = await post(stored);
    expect(second.statusCode).toBe(409);
    expect(matchIds(second)).toEqual([firstId]);

    const confirmed = await post({ ...stored, confirmDuplicate: true });
    expect(confirmed.statusCode).toBe(201);
    const secondId = confirmed.json<Patient>().id;

    const third = await post(stored);
    expect(third.statusCode).toBe(409);
    expect(matchIds(third).sort()).toEqual([firstId, secondId].sort());
    expect(await patientCount()).toBe(2);
  });

  it('logs patient.created with duplicateConfirmed: true', async () => {
    await insert(stored);
    await post({ ...stored, confirmDuplicate: true });
    await post(unrelated);
    const created = t.logs().filter((line) => line.event === 'patient.created');
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ duplicateConfirmed: true });
    expect(created[1]).not.toHaveProperty('duplicateConfirmed');
  });
});

describe('what the check does not override', () => {
  it('an invalid body with a matching email is a 400, not a 409', async () => {
    await insert(stored);
    const response = await post({
      ...stored,
      dateOfBirth: '1984-02-30',
    });
    expect(response.statusCode).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
    expect(errorOf(response).matches).toBeUndefined();
    expect(
      t.logs().some((line) => line.event === 'patient.possible_duplicate'),
    ).toBe(false);
  });

  it('confirmDuplicate that is not a boolean is a 400', async () => {
    await insert(stored);
    const response = await post({ ...stored, confirmDuplicate: 'yes' });
    expect(response.statusCode).toBe(400);
    expect(errorOf(response).details).toEqual([
      { field: 'confirmDuplicate', reason: 'must be true or false' },
    ]);
    expect(await patientCount()).toBe(1);
  });
});

describe('editing a patient runs no duplicate check', () => {
  it("saves another patient's email, phone, name and date of birth with no warning", async () => {
    await insert(stored);
    const otherId = await insert({ ...unrelated, phone: '8015550199' });
    const response = await t.inject({
      method: 'PATCH',
      url: `/api/patients/${otherId}`,
      payload: {
        email: 'TEST.PERSON@example.test',
        phone: '(801) 555-0100',
        firstName: 'Test',
        lastName: 'Person',
        dateOfBirth: '1984-03-09',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<Patient>()).toEqual({ id: otherId, ...stored });
    expect(
      t
        .logs()
        .some((line) =>
          String(line.event).startsWith('patient.possible_duplicate'),
        ),
    ).toBe(false);
  });

  it('refuses confirmDuplicate on an edit as an unknown field', async () => {
    const id = await insert(stored);
    const response = await t.inject({
      method: 'PATCH',
      url: `/api/patients/${id}`,
      payload: { confirmDuplicate: true },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('no patient detail reaches the log', () => {
  // Marker values, each easy to find in the log text if it leaked.
  const marker = {
    firstName: 'Qzmarkfirst',
    lastName: 'Qzmarklast',
    dateOfBirth: '1971-07-23',
    email: 'qzmark.mail@example.test',
    phone: '8015550177',
  };
  const leaks = [
    'qzmark',
    'example.test',
    '1971-07-23',
    '1971',
    '5550177',
    '555-0177',
    '555 0177',
  ];

  it.each([
    ['email', { ...unrelated, email: 'QZMARK.Mail@example.test' }],
    ['phone', { ...unrelated, email: undefined, phone: '(801) 555-0177' }],
    [
      'name_dob',
      {
        ...unrelated,
        firstName: 'QZMARKFIRST',
        lastName: 'qzmarklast',
        dateOfBirth: '1971-07-23',
      },
    ],
  ])(
    'the %s rule logs the code, count, rule and ids only, even at debug',
    async (rule, body) => {
      const id = await insert(marker);
      const response = await post(body);
      expect(response.statusCode).toBe(409);

      const warning = t
        .logs()
        .find((line) => line.event === 'patient.possible_duplicate');
      expect(warning).toMatchObject({
        level: 'warn',
        code: 'POSSIBLE_DUPLICATE',
        matchCount: 1,
        rules: [rule],
      });
      const ids = t
        .logs()
        .find((line) => line.event === 'patient.possible_duplicate.matches');
      expect(ids).toMatchObject({
        level: 'debug',
        matches: [{ patientId: id, rules: [rule] }],
      });

      // Create anyway as well, so its lines are checked too.
      expect((await post({ ...body, confirmDuplicate: true })).statusCode).toBe(
        201,
      );
      const text = t.logText().toLowerCase();
      for (const leak of leaks) expect(text).not.toContain(leak);
    },
  );
});
