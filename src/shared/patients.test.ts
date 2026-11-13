import { describe, expect, it } from 'vitest';

import {
  CONTACT_REQUIRED_REASONS,
  createPatientBody,
  dateOfBirthProblem,
  normalizeEmail,
  normalizePhone,
} from './patients';

const TODAY = '2026-01-14';
const schema = createPatientBody(TODAY);

const valid = {
  firstName: 'Test',
  lastName: 'Patient',
  dateOfBirth: '1984-03-09',
  email: 'test.patient@example.test',
};

// The problems as { field: reason }, or the parsed value when there are none.
function problems(input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  );
}

it('normalizePhone keeps the digits only', () => {
  expect(normalizePhone('(801) 555-0100')).toBe('8015550100');
  expect(normalizePhone('801.555.0100 ')).toBe('8015550100');
  expect(normalizePhone('abc')).toBe('');
});

it('normalizeEmail trims and lower-cases', () => {
  expect(normalizeEmail(' Jane@Example.test ')).toBe('jane@example.test');
});

describe('the new patient schema', () => {
  it('trims names and normalizes email and phone', () => {
    expect(
      schema.parse({
        firstName: '  Test ',
        lastName: ' Patient',
        dateOfBirth: '1984-03-09',
        email: 'Jane@Example.test',
        phone: '(801) 555-0100',
      }),
    ).toEqual({
      firstName: 'Test',
      lastName: 'Patient',
      dateOfBirth: '1984-03-09',
      email: 'jane@example.test',
      phone: '8015550100',
    });
  });

  it('requires first name, last name and date of birth', () => {
    expect(problems({ ...valid, firstName: '   ' })).toEqual({
      firstName: 'is required',
    });
    expect(problems({ email: valid.email })).toEqual({
      firstName: 'is required',
      lastName: 'is required',
      dateOfBirth: 'is required',
    });
  });

  it('limits names to 100 characters', () => {
    expect(problems({ ...valid, lastName: 'x'.repeat(100) })).toEqual({});
    expect(problems({ ...valid, lastName: 'x'.repeat(101) })).toEqual({
      lastName: 'must be 100 characters or fewer',
    });
  });

  it('needs an email or a phone, and reports it on both', () => {
    const neither = { ...valid, email: undefined };
    expect(problems(neither)).toEqual(CONTACT_REQUIRED_REASONS);
    // Empty text and null count as absent.
    expect(problems({ ...neither, email: '  ', phone: null })).toEqual(
      CONTACT_REQUIRED_REASONS,
    );
    expect(problems({ ...neither, phone: '5550100' })).toEqual({});
    expect(problems(valid)).toEqual({});
  });

  it('reports the contact rule together with other problems', () => {
    expect(problems({ firstName: 'Test' })).toEqual({
      lastName: 'is required',
      dateOfBirth: 'is required',
      ...CONTACT_REQUIRED_REASONS,
    });
  });

  it('rejects a phone without 7 to 15 digits', () => {
    expect(problems({ ...valid, phone: 'abc' })).toEqual({
      phone: 'must have 7 to 15 digits',
    });
    expect(problems({ ...valid, phone: '555-010' })).toEqual({
      phone: 'must have 7 to 15 digits',
    });
    expect(problems({ ...valid, phone: '1'.repeat(16) })).toEqual({
      phone: 'must have 7 to 15 digits',
    });
    expect(problems({ ...valid, phone: '1'.repeat(15) })).toEqual({});
  });

  it('rejects an email that does not look like one', () => {
    expect(problems({ ...valid, email: 'not-an-email' })).toEqual({
      email: 'must be an email address',
    });
  });

  it('refuses unknown fields', () => {
    const result = schema.safeParse({ ...valid, isAdmin: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.code).toBe('unrecognized_keys');
  });
});

describe('dateOfBirthProblem', () => {
  it.each([
    ['2020-02-29', undefined],
    [TODAY, undefined],
    ['2020-02-30', 'must be a real calendar date'],
    ['1984-13-01', 'must be a real calendar date'],
    ['2026-01-15', 'cannot be in the future'],
    ['31/12/1990', 'must be a date written YYYY-MM-DD'],
    ['', 'is required'],
  ])('%s gives %s', (value, reason) => {
    expect(dateOfBirthProblem(value, TODAY)).toBe(reason);
  });

  it('is the schema check for date of birth', () => {
    expect(problems({ ...valid, dateOfBirth: '2026-01-15' })).toEqual({
      dateOfBirth: 'cannot be in the future',
    });
  });
});
