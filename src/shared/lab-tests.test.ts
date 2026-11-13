import { describe, expect, it } from 'vitest';

import {
  createLabTestBody,
  LAB_TEST_MESSAGES,
  labTestParams,
  updateLabTestBody,
} from './lab-tests';

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

// The fields an update body was rejected for, with their messages.
function updateProblems(input: unknown): Record<string, string> {
  const result = updateLabTestBody.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [
      issue.path.join('.') || issue.code,
      issue.message,
    ]),
  );
}

describe('updateLabTestBody', () => {
  it.each([
    { name: 'Renamed' },
    { priceCents: 0 },
    { turnaroundDays: 365 },
    { isActive: false },
    { isActive: true },
  ])('accepts the single field %j', (body) => {
    expect(updateLabTestBody.parse(body)).toEqual(body);
  });

  it('accepts every field together and trims the name', () => {
    expect(
      updateLabTestBody.parse({
        name: '  Renamed ',
        priceCents: 2500,
        turnaroundDays: 1,
        isActive: false,
      }),
    ).toEqual({
      name: 'Renamed',
      priceCents: 2500,
      turnaroundDays: 1,
      isActive: false,
    });
  });

  it('rejects an empty body', () => {
    expect(updateProblems({})).toEqual({
      custom: LAB_TEST_MESSAGES.emptyUpdate,
    });
  });

  it('rejects the code, even with a valid field beside it', () => {
    // Reported as the refused key only, not also as an empty body.
    expect(Object.keys(updateProblems({ code: 'NEW-1' }))).toEqual([
      'unrecognized_keys',
    ]);
    expect(updateProblems({ name: 'Fine', code: 'NEW-1' })).toHaveProperty(
      'unrecognized_keys',
    );
  });

  it('rejects an unknown field', () => {
    expect(updateProblems({ name: 'Fine', isAdmin: true })).toHaveProperty(
      'unrecognized_keys',
    );
  });

  // The same rules as create: these come from the same schema pieces.
  it.each([
    { body: { name: '  ' }, field: 'name' },
    { body: { name: 'x'.repeat(101) }, field: 'name' },
    { body: { priceCents: -1 }, field: 'priceCents' },
    { body: { priceCents: 1.5 }, field: 'priceCents' },
    { body: { turnaroundDays: 0 }, field: 'turnaroundDays' },
    { body: { turnaroundDays: 366 }, field: 'turnaroundDays' },
    { body: { isActive: 'false' }, field: 'isActive' },
    { body: { isActive: null }, field: 'isActive' },
  ])('rejects $body on $field', ({ body, field }) => {
    expect(Object.keys(updateProblems(body))).toEqual([field]);
  });

  it('accepts the boundary values 0 cents, 1 day and the largest price', () => {
    expect(updateProblems({ priceCents: 0, turnaroundDays: 1 })).toEqual({});
    expect(updateProblems({ priceCents: 2_147_483_647 })).toEqual({});
    expect(updateProblems({ priceCents: 2_147_483_648 })).toEqual({
      priceCents: LAB_TEST_MESSAGES.tooLarge,
    });
  });
});

describe('labTestParams', () => {
  it('accepts a uuid and rejects anything else', () => {
    const id = '10000000-0000-4000-8000-000000000001';
    expect(labTestParams.parse({ id })).toEqual({ id });
    expect(labTestParams.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(labTestParams.safeParse({ id: '123' }).success).toBe(false);
  });
});
