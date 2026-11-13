import { describe, expect, it } from 'vitest';

import { createLabTestBody, LAB_TEST_MESSAGES } from './lab-tests';

const valid = {
  code: 'DEMO-09',
  name: 'Demo Panel',
  priceCents: 1999,
  turnaroundDays: 2,
};

// The fields a body was rejected for, with their messages.
function problems(input: unknown): Record<string, string> {
  const result = createLabTestBody.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [
      issue.path.join('.') || issue.code,
      issue.message,
    ]),
  );
}

describe('createLabTestBody', () => {
  it('accepts a valid body', () => {
    expect(createLabTestBody.parse(valid)).toEqual(valid);
  });

  it('trims and upper-cases the code and trims the name', () => {
    expect(
      createLabTestBody.parse({
        ...valid,
        code: '  demo-09 ',
        name: '  Demo Panel ',
      }),
    ).toMatchObject({ code: 'DEMO-09', name: 'Demo Panel' });
  });

  it.each(['AB', 'A'.repeat(20), 'A1-B2', '12'])(
    'accepts the code %j',
    (code) => {
      expect(problems({ ...valid, code })).toEqual({});
    },
  );

  it.each(['A', 'A'.repeat(21), 'AB C', 'AB_C', 'ÄB', '', '  ', 'C.B'])(
    'rejects the code %j',
    (code) => {
      expect(problems({ ...valid, code })).toEqual({
        code: LAB_TEST_MESSAGES.code,
      });
    },
  );

  it.each(['', '   ', 'x'.repeat(101)])('rejects the name %j', (name) => {
    expect(problems({ ...valid, name })).toEqual({
      name: LAB_TEST_MESSAGES.name,
    });
  });

  it('accepts a name of 1 and of 100 characters', () => {
    expect(problems({ ...valid, name: 'x' })).toEqual({});
    expect(problems({ ...valid, name: 'x'.repeat(100) })).toEqual({});
  });

  it('accepts a price of 0 and a turnaround of 1', () => {
    expect(problems({ ...valid, priceCents: 0, turnaroundDays: 1 })).toEqual(
      {},
    );
  });

  it.each([-1, 1.5, '1999', null, Number.NaN])(
    'rejects the price %j',
    (priceCents) => {
      expect(problems({ ...valid, priceCents })).toEqual({
        priceCents: LAB_TEST_MESSAGES.priceCents,
      });
    },
  );

  it.each([0, -1, 1.5, '2', 366, 2 ** 31])(
    'rejects the turnaround %j',
    (turnaroundDays) => {
      expect(problems({ ...valid, turnaroundDays })).toEqual({
        turnaroundDays: LAB_TEST_MESSAGES.turnaroundDays,
      });
    },
  );

  it('accepts a turnaround of 365 days, the most allowed', () => {
    expect(problems({ ...valid, turnaroundDays: 365 })).toEqual({});
  });

  it('rejects a price too large for the database integer column', () => {
    expect(problems({ ...valid, priceCents: 2_147_483_648 })).toEqual({
      priceCents: LAB_TEST_MESSAGES.tooLarge,
    });
    expect(problems({ ...valid, priceCents: 2_147_483_647 })).toEqual({});
  });

  it('rejects a missing field', () => {
    expect(problems({ ...valid, code: undefined })).toEqual({
      code: LAB_TEST_MESSAGES.code,
    });
  });

  it('rejects an unknown field, including isActive', () => {
    expect(problems({ ...valid, isAdmin: true })).toHaveProperty(
      'unrecognized_keys',
    );
    expect(problems({ ...valid, isActive: false })).toHaveProperty(
      'unrecognized_keys',
    );
  });
});
