// GET /api/patients?q=, GET and PATCH /api/patients/:id through the app, on
// the test database.
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ErrorBody } from '../../shared/api-error';
import { type Patient, SEARCH_RESULT_LIMIT } from '../../shared/patients';
import { startTestApp, type TestApp } from '../testing/harness';

let t: TestApp;

beforeEach(async () => {
  t = startTestApp();
  await t.pool.query('truncate table patients');
});

afterEach(async () => {
  await t.close();
});

const base = {
  firstName: 'Test',
  lastName: 'Patient',
  dateOfBirth: '1984-03-09',
  email: 'test.patient@example.test',
};

async function create(body: Record<string, unknown> = {}): Promise<Patient> {
  const response = await t.inject({
    method: 'POST',
    url: '/api/patients',
    payload: { ...base, ...body },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Patient>();
}

// GET /api/patients with `q` as typed (encoded here).
function search(q: string) {
  return t.inject({
    method: 'GET',
    url: `/api/patients?q=${encodeURIComponent(q)}`,
  });
}

async function names(q: string): Promise<string[]> {
  const response = await search(q);
  expect(response.statusCode).toBe(200);
  return response
    .json<Patient[]>()
    .map((patient) => `${patient.firstName} ${patient.lastName}`);
}

function patch(id: string, body: unknown) {
  return t.inject({
    method: 'PATCH',
    url: `/api/patients/${id}`,
    payload: body as Record<string, unknown>,
  });
}

type StoredRow = Omit<Patient, 'id'> & { updatedAt: Date };

async function stored(id: string): Promise<StoredRow> {
  const { rows } = await t.pool.query<StoredRow>(
    `select first_name as "firstName", last_name as "lastName",
            date_of_birth as "dateOfBirth", email, phone, updated_at as "updatedAt"
     from patients where id = $1`,
    [id],
  );
  return rows[0]!;
}

function expectError(
  response: Awaited<ReturnType<typeof patch>>,
  statusCode: number,
  code: string,
): ErrorBody['error'] {
  expect(response.statusCode).toBe(statusCode);
  const { error } = response.json<ErrorBody>();
  expect(error.code).toBe(code);
  expect(error.requestId).toBe(response.headers['x-request-id']);
  return error;
}

describe('GET /api/patients?q=', () => {
  beforeEach(async () => {
    await create({ firstName: 'Jane', lastName: 'Smith' });
    await create({ firstName: 'Demo', lastName: 'Example' });
    await create({ firstName: 'Sample', lastName: 'Person' });
  });

  it.each([
    ['jane', ['Jane Smith']],
    ['SMITH', ['Jane Smith']],
    ['Sm', ['Jane Smith']],
    ['mit', ['Jane Smith']],
    ['jane sm', ['Jane Smith']],
    ['  jane  ', ['Jane Smith']],
    // "Sample Person" and "Demo Example" both contain "mp".
    ['mp', ['Demo Example', 'Sample Person']],
  ])('%j finds %j', async (q, expected) => {
    expect(await names(q)).toEqual(expected);
  });

  it('does not match last name first, or across the gap the wrong way', async () => {
    expect(await names('smith jane')).toEqual([]);
  });

  it('returns [] when nothing matches', async () => {
    expect(await names('zzz')).toEqual([]);
  });

  it('returns every patient for an empty or blank q, and with no q', async () => {
    const all = ['Demo Example', 'Sample Person', 'Jane Smith'];
    expect(await names('')).toEqual(all);
    expect(await names('   ')).toEqual(all);
    const response = await t.inject({ method: 'GET', url: '/api/patients' });
    expect(response.json<Patient[]>()).toHaveLength(3);
  });

  it('treats %, _ and \\ as plain characters', async () => {
    expect(await names('%')).toEqual([]);
    expect(await names('_')).toEqual([]);
    expect(await names('\\')).toEqual([]);
    expect(await names('J%e')).toEqual([]);
    await create({ firstName: 'Under_score', lastName: '100%' });
    expect(await names('_')).toEqual(['Under_score 100%']);
    expect(await names('%')).toEqual(['Under_score 100%']);
  });

  it('is safe from SQL in the text', async () => {
    expect(await names("' or 1=1 --")).toEqual([]);
    expect(await names('Smith')).toEqual(['Jane Smith']);
  });

  it('accepts 100 characters and refuses 101 with 400', async () => {
    expect((await search('a'.repeat(100))).statusCode).toBe(200);
    const error = expectError(
      await search('a'.repeat(101)),
      400,
      'VALIDATION_ERROR',
    );
    expect(error.details).toEqual([
      { field: 'q', reason: 'must be 100 characters or fewer' },
    ]);
  });

  it('refuses a control character, a repeated q and an unknown parameter with 400', async () => {
    expectError(await search('a\u0000'), 400, 'VALIDATION_ERROR');
    for (const url of ['/api/patients?q=a&q=b', '/api/patients?name=a']) {
      expectError(
        await t.inject({ method: 'GET', url }),
        400,
        'VALIDATION_ERROR',
      );
    }
  });

  it(`returns at most ${SEARCH_RESULT_LIMIT} patients, in the list's order`, async () => {
    await t.pool.query('truncate table patients');
    await t.pool.query(
      `insert into patients (first_name, last_name, date_of_birth, email)
       select 'Many', 'Tester ' || lpad(n::text, 3, '0'), '1990-01-01',
              'many@example.test'
       from generate_series(1, $1::int) as n`,
      [SEARCH_RESULT_LIMIT + 5],
    );
    const response = await search('many');
    const found = response.json<Patient[]>();
    expect(found).toHaveLength(SEARCH_RESULT_LIMIT);
    expect(found[0]?.lastName).toBe('Tester 001');
    expect(found.at(-1)?.lastName).toBe(`Tester 0${SEARCH_RESULT_LIMIT}`);
    // The unfiltered list is not capped.
    const all = await t.inject({ method: 'GET', url: '/api/patients' });
    expect(all.json<Patient[]>()).toHaveLength(SEARCH_RESULT_LIMIT + 5);
  });
});

describe('GET /api/patients/:id', () => {
  it('returns the patient', async () => {
    const patient = await create({ phone: '801-555-0100' });
    const response = await t.inject({
      method: 'GET',
      url: `/api/patients/${patient.id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(patient);
  });

  it('is 404 NOT_FOUND for an unknown id and 400 for one that is not a uuid', async () => {
    const missing = await t.inject({
      method: 'GET',
      url: `/api/patients/${randomUUID()}`,
    });
    expect(expectError(missing, 404, 'NOT_FOUND').message).toBe(
      'There is no patient with this id',
    );
    const malformed = await t.inject({
      method: 'GET',
      url: '/api/patients/abc',
    });
    expect(expectError(malformed, 400, 'VALIDATION_ERROR').details).toEqual([
      { field: 'id', reason: 'must be a uuid' },
    ]);
  });
});

describe('PATCH /api/patients/:id', () => {
  it.each([
    [{ firstName: ' Janet ' }, { firstName: 'Janet' }],
    [{ lastName: 'Sample' }, { lastName: 'Sample' }],
    [{ dateOfBirth: '2020-02-29' }, { dateOfBirth: '2020-02-29' }],
    [{ email: ' New@Example.test' }, { email: 'new@example.test' }],
    [{ phone: '+1 (801) 555-0102' }, { phone: '8015550102' }],
  ])('sets %j, normalized, and changes nothing else', async (body, change) => {
    const patient = await create();
    const response = await patch(patient.id, body);
    expect(response.statusCode).toBe(200);
    const expected = { ...patient, ...change };
    expect(response.json()).toEqual(expected);
    const { updatedAt, ...row } = await stored(patient.id);
    expect(updatedAt).toBeInstanceOf(Date);
    const { id, ...rest } = expected;
    expect(id).toBe(patient.id);
    expect(row).toEqual(rest);
  });

  it('advances updated_at', async () => {
    const patient = await create();
    const before = (await stored(patient.id)).updatedAt;
    expect((await patch(patient.id, { lastName: 'Later' })).statusCode).toBe(
      200,
    );
    const after = (await stored(patient.id)).updatedAt;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it('removes the email with null when there is a phone', async () => {
    const patient = await create({ phone: '8015550100' });
    const response = await patch(patient.id, { email: null });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ email: null, phone: '8015550100' });
    expect((await stored(patient.id)).email).toBeNull();
  });

  it('is 422 CONTACT_REQUIRED, changing nothing, when no email or phone would remain', async () => {
    const patient = await create(); // email only
    const before = await stored(patient.id);
    const error = expectError(
      await patch(patient.id, { email: null, lastName: 'Changed' }),
      422,
      'CONTACT_REQUIRED',
    );
    expect(error.details).toEqual([
      { field: 'email', reason: 'is required when there is no phone number' },
      { field: 'phone', reason: 'is required when there is no email' },
    ]);
    expect(await stored(patient.id)).toEqual(before);
    expect(
      t.logs().filter((line) => line.event === 'request.rejected'),
    ).toEqual([
      expect.objectContaining({
        level: 'warn',
        code: 'CONTACT_REQUIRED',
        statusCode: 422,
      }),
    ]);
  });

  it('is 422 when both are cleared at once, and empty text clears like null', async () => {
    const patient = await create({ phone: '8015550100' });
    expectError(
      await patch(patient.id, { email: '', phone: null }),
      422,
      'CONTACT_REQUIRED',
    );
    expect(await stored(patient.id)).toMatchObject({
      email: base.email,
      phone: '8015550100',
    });
  });

  it('is 404 NOT_FOUND for an unknown id and 400 for one that is not a uuid', async () => {
    expectError(
      await patch(randomUUID(), { lastName: 'Nobody' }),
      404,
      'NOT_FOUND',
    );
    expectError(
      await patch('not-a-uuid', { lastName: 'Nobody' }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it.each([
    [{}, ['(input)']],
    [{ isAdmin: true }, ['isAdmin']],
    [{ id: randomUUID() }, ['id']],
    [{ firstName: null }, ['firstName']],
    [{ dateOfBirth: '2020-02-30' }, ['dateOfBirth']],
    // The harness clock is 2026-01-15 10:00 in Denver.
    [{ dateOfBirth: '2026-01-16' }, ['dateOfBirth']],
    [{ email: 'not-an-email' }, ['email']],
    [{ phone: '555-0100' }, ['phone']],
  ])('rejects %j with 400 on %j and changes nothing', async (body, fields) => {
    const patient = await create();
    const before = await stored(patient.id);
    const error = expectError(
      await patch(patient.id, body),
      400,
      'VALIDATION_ERROR',
    );
    expect(error.details?.map((detail) => detail.field)).toEqual(fields);
    expect(await stored(patient.id)).toEqual(before);
  });

  it("just before midnight in the clinic, accepts the clinic's today and rejects its tomorrow", async () => {
    const patient = await create();
    await t.close();
    const originalTz = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      // 23:59 in Denver on Jan 14 (UTC-7), already Jan 15 in UTC.
      t = startTestApp({ clock: () => new Date('2026-01-15T06:59:00Z') });
      const accepted = await patch(patient.id, { dateOfBirth: '2026-01-14' });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json<Patient>().dateOfBirth).toBe('2026-01-14');
      const tomorrow = await patch(patient.id, { dateOfBirth: '2026-01-15' });
      expect(expectError(tomorrow, 400, 'VALIDATION_ERROR').details).toEqual([
        { field: 'dateOfBirth', reason: 'cannot be in the future' },
      ]);
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe('no search text or patient detail reaches the log', () => {
  const MARKER = 'Zqxsearchmarker';

  function expectNoMarker(...markers: string[]): void {
    const text = t.logText().toLowerCase();
    for (const marker of [MARKER, ...markers]) {
      expect(text).not.toContain(marker.toLowerCase());
    }
  }

  it('on a search that finds a patient, with patient.search counting only', async () => {
    await create({ firstName: MARKER });
    expect(await names(MARKER.slice(0, 10))).toHaveLength(1);
    expectNoMarker(MARKER.slice(0, 10));
    const searches = t.logs().filter((line) => line.event === 'patient.search');
    const { level, time, requestId, msg, ...fields } = searches[0]!;
    expect([level, typeof time, typeof requestId, msg]).toEqual([
      'debug',
      'string',
      'string',
      'Patients listed',
    ]);
    expect(fields).toEqual({
      event: 'patient.search',
      hasQuery: true,
      resultCount: 1,
    });
    // The request line has the route pattern, not the URL with its query.
    const completed = t
      .logs()
      .filter((line) => line.event === 'request.completed');
    expect(completed.at(-1)).toMatchObject({ route: '/api/patients' });
  });

  it('on a search that matches nothing', async () => {
    expect(await names(MARKER)).toEqual([]);
    expectNoMarker();
  });

  it('on a rejected search: too long, a control character, an unknown parameter', async () => {
    expect((await search(MARKER.repeat(10))).statusCode).toBe(400);
    expect((await search(`${MARKER}\u0000`)).statusCode).toBe(400);
    const unknown = await t.inject({
      method: 'GET',
      url: `/api/patients?${MARKER}=${MARKER}`,
    });
    expect(unknown.statusCode).toBe(400);
    expectNoMarker();
  });

  it('on an update: patient.updated once, at info, with the id and field names', async () => {
    const patient = await create();
    const response = await patch(patient.id, {
      lastName: MARKER,
      phone: '(801) 555-0177',
    });
    expect(response.statusCode).toBe(200);
    expectNoMarker('8015550177', '555-0177', base.email, base.dateOfBirth);
    const updated = t.logs().filter((line) => line.event === 'patient.updated');
    expect(updated).toHaveLength(1);
    const { level, time, requestId, msg, ...fields } = updated[0]!;
    expect([level, typeof time, typeof requestId, msg]).toEqual([
      'info',
      'string',
      'string',
      'Patient updated',
    ]);
    expect(fields).toEqual({
      event: 'patient.updated',
      patientId: patient.id,
      changedFields: ['lastName', 'phone'],
    });
  });

  it('on a rejected update and a contact-rule violation', async () => {
    const patient = await create();
    expect(
      (await patch(patient.id, { lastName: MARKER, [MARKER]: 1 })).statusCode,
    ).toBe(400);
    expect(
      (await patch(patient.id, { lastName: MARKER, email: null })).statusCode,
    ).toBe(422);
    expectNoMarker(base.email);
  });
});
