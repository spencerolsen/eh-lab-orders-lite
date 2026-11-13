// POST and GET /api/patients through the app, on the test database.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ErrorBody } from '../../shared/api-error';
import type { Patient } from '../../shared/patients';
import { startTestApp, type TestApp } from '../testing/harness';

let t: TestApp;

beforeEach(async () => {
  t = startTestApp();
  await t.pool.query('truncate table patients');
});

afterEach(async () => {
  await t.close();
});

const valid = {
  firstName: 'Test',
  lastName: 'Patient',
  dateOfBirth: '1984-03-09',
  email: 'test.patient@example.test',
};

async function post(body: Record<string, unknown>) {
  return t.inject({ method: 'POST', url: '/api/patients', payload: body });
}

async function list(): Promise<Patient[]> {
  const response = await t.inject({ method: 'GET', url: '/api/patients' });
  expect(response.statusCode).toBe(200);
  return response.json<Patient[]>();
}

type Row = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  email: string | null;
  phone: string | null;
};

// The stored row, read with SQL, so the test sees what the database holds.
async function storedRows(): Promise<Row[]> {
  const { rows } = await t.pool.query<Row>(
    'select first_name, last_name, date_of_birth, email, phone from patients',
  );
  return rows;
}

describe('POST /api/patients', () => {
  it('creates a patient with normalized values and returns 201', async () => {
    const response = await post({
      firstName: '  Jane ',
      lastName: ' Sample',
      dateOfBirth: '1984-03-09',
      email: 'Jane@Example.test',
      phone: '(801) 555-0100',
    });
    expect(response.statusCode).toBe(201);
    const { id, ...body } = response.json<Patient>();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toEqual({
      firstName: 'Jane',
      lastName: 'Sample',
      dateOfBirth: '1984-03-09',
      email: 'jane@example.test',
      phone: '8015550100',
    });
    expect(await storedRows()).toEqual([
      {
        first_name: 'Jane',
        last_name: 'Sample',
        date_of_birth: '1984-03-09',
        email: 'jane@example.test',
        phone: '8015550100',
      },
    ]);
  });

  it('accepts only an email, or only a phone, and stores the other as null', async () => {
    expect((await post(valid)).json()).toMatchObject({ phone: null });
    const phoneOnly = await post({
      ...valid,
      email: '',
      phone: '5550100',
    });
    expect(phoneOnly.statusCode).toBe(201);
    expect(phoneOnly.json()).toMatchObject({ email: null, phone: '5550100' });
  });

  it('creates two patients with identical details (no duplicate check yet)', async () => {
    expect((await post(valid)).statusCode).toBe(201);
    expect((await post(valid)).statusCode).toBe(201);
    expect(await storedRows()).toHaveLength(2);
  });

  it.each([
    [{ ...valid, firstName: undefined }, ['firstName']],
    [{ ...valid, lastName: ' ' }, ['lastName']],
    [{ ...valid, dateOfBirth: undefined }, ['dateOfBirth']],
    [{ ...valid, dateOfBirth: '2020-02-30' }, ['dateOfBirth']],
    [{ ...valid, dateOfBirth: '1984-13-01' }, ['dateOfBirth']],
    [{ ...valid, dateOfBirth: '31/12/1990' }, ['dateOfBirth']],
    // The harness clock is 2026-01-15 10:00 in Denver.
    [{ ...valid, dateOfBirth: '2026-01-16' }, ['dateOfBirth']],
    [{ ...valid, email: undefined }, ['email', 'phone']],
    [{ ...valid, email: 'not-an-email' }, ['email']],
    [{ ...valid, phone: 'abc' }, ['phone']],
    [{ ...valid, isAdmin: true }, ['isAdmin']],
    // A NUL that would reach Postgres (which refuses it) is a 400, not a 500.
    [{ ...valid, firstName: 'Test\u0000' }, ['firstName']],
    [{ ...valid, lastName: 'Patient\u0000' }, ['lastName']],
    [{ ...valid, dateOfBirth: '1984-03-0\u0000' }, ['dateOfBirth']],
    [{ ...valid, email: 'test\u0000@example.test' }, ['email']],
    [{ ...valid, phone: '555\u00000100' }, ['phone']],
  ])('rejects %j with 400 on %j', async (body, fields) => {
    const response = await post(body);
    expect(response.statusCode).toBe(400);
    const { error } = response.json<ErrorBody>();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.requestId).toBe(response.headers['x-request-id']);
    expect(error.details?.map((d) => d.field)).toEqual(fields);
    expect(await storedRows()).toHaveLength(0);
  });

  it("accepts today's date (in the clinic) and 2020-02-29", async () => {
    expect(
      (await post({ ...valid, dateOfBirth: '2026-01-15' })).statusCode,
    ).toBe(201);
    expect(
      (await post({ ...valid, dateOfBirth: '2020-02-29' })).statusCode,
    ).toBe(201);
  });
});

describe('the clinic time zone decides "today"', () => {
  it("just before midnight in the clinic, accepts the clinic's today and rejects its tomorrow", async () => {
    await t.close();
    // The process runs in UTC, as CI does, whatever the machine's own zone:
    // a server that used its own zone instead of CLINIC_TIMEZONE would then
    // think it is already Jan 15 and fail this test on every machine.
    const originalTz = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      // 23:59 in Denver on Jan 14 (UTC-7), already Jan 15 in UTC.
      t = startTestApp({ clock: () => new Date('2026-01-15T06:59:00Z') });
      expect(
        (await post({ ...valid, dateOfBirth: '2026-01-14' })).statusCode,
      ).toBe(201);
      const tomorrow = await post({ ...valid, dateOfBirth: '2026-01-15' });
      expect(tomorrow.statusCode).toBe(400);
      expect(tomorrow.json<ErrorBody>().error.details).toEqual([
        { field: 'dateOfBirth', reason: 'cannot be in the future' },
      ]);
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe('GET /api/patients', () => {
  it('lists patients by last name, then first name', async () => {
    for (const [firstName, lastName] of [
      ['Zed', 'Sample'],
      ['Demo', 'example'],
      ['Ann', 'Sample'],
      ['Test', 'Patient'],
    ]) {
      await post({ ...valid, firstName, lastName });
    }
    expect((await list()).map((p) => `${p.firstName} ${p.lastName}`)).toEqual([
      'Demo example',
      'Test Patient',
      'Ann Sample',
      'Zed Sample',
    ]);
  });

  it('returns an empty array when there are no patients', async () => {
    expect(await list()).toEqual([]);
  });
});

describe('a date of birth round-trips as the same string', () => {
  const originalTz = process.env.TZ;
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('under TZ=America/Los_Angeles', async () => {
    process.env.TZ = 'America/Los_Angeles';
    // The process really is in Los Angeles now (UTC-8 in January).
    expect(new Date('2026-01-15T12:00:00Z').getTimezoneOffset()).toBe(480);
    for (const dateOfBirth of ['1984-03-09', '2000-01-01', '2020-02-29']) {
      const created = await post({ ...valid, dateOfBirth });
      expect(created.json<Patient>().dateOfBirth).toBe(dateOfBirth);
    }
    expect((await list()).map((p) => p.dateOfBirth).sort()).toEqual([
      '1984-03-09',
      '2000-01-01',
      '2020-02-29',
    ]);
  });
});

describe('the database constraints', () => {
  const insert = (values: string) =>
    t.pool.query(
      `insert into patients (first_name, last_name, date_of_birth, email, phone)
       values ${values}`,
    );

  it.each([
    [
      `('Test', 'Patient', '1984-03-09', null, null)`,
      'patients_contact_required',
    ],
    [
      `('Test', 'Patient', '1984-03-09', null, '555abc')`,
      'patients_phone_digits',
    ],
    [
      `('Test', 'Patient', '1984-03-09', 'Jane@Example.test', null)`,
      'patients_email_lower_case',
    ],
    [
      `(' ', 'Patient', '1984-03-09', null, '5550100')`,
      'patients_first_name_not_blank',
    ],
    [
      `('Test', '', '1984-03-09', null, '5550100')`,
      'patients_last_name_not_blank',
    ],
    [
      `('Test', 'Patient', current_date + 2, null, '5550100')`,
      'patients_date_of_birth_not_future',
    ],
  ])('rejects %s (%s)', async (values, constraint) => {
    await expect(insert(values)).rejects.toMatchObject({
      code: '23514',
      constraint,
    });
  });

  it('accepts current_date + 1, the loose backstop for a clinic ahead of UTC', async () => {
    await insert(`('Test', 'Patient', current_date + 1, null, '5550100')`);
    expect(await storedRows()).toHaveLength(1);
  });
});

describe('no patient detail reaches the log', () => {
  // Marker values in every field: none of them may appear in any log line.
  const markers = {
    firstName: 'Zqxfirstmarker',
    lastName: 'Zqxlastmarker',
    dateOfBirth: '1961-07-23',
    email: 'zqx.emailmarker@example.test',
    phone: '(801) 555-0177',
  };
  const forbidden = [
    'zqxfirstmarker',
    'zqxlastmarker',
    '1961-07-23',
    'zqx.emailmarker',
    '5550177',
    '555-0177',
    // The impossible date of birth the rejected request sends.
    '1961-07-32',
  ];

  function expectNoMarkers(): void {
    const text = t.logText().toLowerCase();
    for (const marker of forbidden) expect(text).not.toContain(marker);
  }

  it('on success: patient.created once, at info, with the id only', async () => {
    const response = await post(markers);
    expect(response.statusCode).toBe(201);
    await list();
    expectNoMarkers();
    const created = t.logs().filter((line) => line.event === 'patient.created');
    expect(created).toHaveLength(1);
    const { level, time, requestId, msg, ...fields } = created[0]!;
    expect({
      level,
      requestId: typeof requestId,
      msg,
      time: typeof time,
    }).toEqual({
      level: 'info',
      requestId: 'string',
      msg: 'Patient created',
      time: 'string',
    });
    expect(fields).toEqual({
      event: 'patient.created',
      patientId: response.json<Patient>().id,
    });
  });

  it('on a rejected request, including a field name the client chose', async () => {
    const response = await post({
      ...markers,
      email: 'zqx.emailmarker-not-an-email',
      dateOfBirth: '1961-07-32',
      zqxfirstmarker: 'zqxlastmarker',
    });
    expect(response.statusCode).toBe(400);
    expectNoMarkers();
    const rejected = t
      .logs()
      .filter((line) => line.event === 'request.rejected');
    expect(rejected).toEqual([
      expect.objectContaining({
        level: 'warn',
        code: 'VALIDATION_ERROR',
        fieldCount: 3,
      }),
    ]);
  });
});
