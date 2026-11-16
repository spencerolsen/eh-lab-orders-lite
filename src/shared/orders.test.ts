// The cancel request body (LAB-17): both fields trimmed and required, with
// their length limits, and nothing else accepted.
import { describe, expect, it } from 'vitest';

import { cancelOrderBody, listOrdersQuery } from './orders';

const valid = { note: 'Patient asked to cancel', cancelledBy: 'Sample Staff' };

// The field and reason of each problem, as the 400's details list them.
function problems(input: unknown) {
  const result = cancelOrderBody.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    reason: issue.message,
  }));
}

describe('cancelOrderBody', () => {
  it('trims both fields', () => {
    expect(
      cancelOrderBody.parse({
        note: '  Duplicate order \n',
        cancelledBy: '\tSample Staff ',
      }),
    ).toEqual({ note: 'Duplicate order', cancelledBy: 'Sample Staff' });
  });

  it('accepts a 500-character note and a 100-character name', () => {
    const body = { note: 'n'.repeat(500), cancelledBy: 'b'.repeat(100) };
    expect(cancelOrderBody.parse(body)).toEqual(body);
  });

  it('counts the length after trimming', () => {
    const body = {
      note: ` ${'n'.repeat(500)} `,
      cancelledBy: ` ${'b'.repeat(100)} `,
    };
    expect(cancelOrderBody.safeParse(body).success).toBe(true);
  });

  it('rejects a 501-character note and a 101-character name', () => {
    expect(
      problems({ note: 'n'.repeat(501), cancelledBy: 'b'.repeat(101) }),
    ).toEqual([
      { field: 'note', reason: 'must be 500 characters or fewer' },
      { field: 'cancelledBy', reason: 'must be 100 characters or fewer' },
    ]);
  });

  it.each([
    { name: 'empty', value: '' },
    { name: 'blank', value: '   ' },
    { name: 'blank with line breaks', value: ' \n\t ' },
  ])('rejects an $name note and name', ({ value }) => {
    expect(problems({ note: value, cancelledBy: value })).toEqual([
      { field: 'note', reason: 'is required' },
      { field: 'cancelledBy', reason: 'is required' },
    ]);
  });

  it('rejects missing fields', () => {
    expect(problems({})).toEqual([
      { field: 'note', reason: 'is required' },
      { field: 'cancelledBy', reason: 'is required' },
    ]);
  });

  it('rejects values that are not text', () => {
    expect(problems({ note: 5, cancelledBy: null })).toEqual([
      { field: 'note', reason: 'must be text' },
      { field: 'cancelledBy', reason: 'must be text' },
    ]);
  });

  it('rejects an unknown field', () => {
    expect(problems({ ...valid, reason: 'x' })).toEqual([
      { field: '', reason: expect.stringContaining('reason') as string },
    ]);
  });

  it('keeps line breaks inside a note, and refuses other control characters', () => {
    expect(cancelOrderBody.parse({ ...valid, note: 'one\ntwo' }).note).toBe(
      'one\ntwo',
    );
    expect(problems({ ...valid, note: 'one\u0000two' })).toEqual([
      {
        field: 'note',
        reason:
          'must not contain control characters other than line breaks and tabs',
      },
    ]);
    expect(problems({ ...valid, cancelledBy: 'Sample\nStaff' })).toEqual([
      { field: 'cancelledBy', reason: 'must not contain control characters' },
    ]);
  });
});

describe('listOrdersQuery sort and dir', () => {
  it('defaults to newest first', () => {
    expect(listOrdersQuery.parse({})).toMatchObject({
      sort: 'created',
      dir: 'desc',
    });
  });

  it.each(['created', 'readyBy', 'status', 'patient'])(
    'accepts sort=%s',
    (sort) => {
      expect(listOrdersQuery.parse({ sort }).sort).toBe(sort);
    },
  );

  it.each(['asc', 'desc'])('accepts dir=%s', (dir) => {
    expect(listOrdersQuery.parse({ dir }).dir).toBe(dir);
  });

  it.each(['total', 'tests', 'Created', '', 'created,status'])(
    'rejects sort=%j',
    (sort) => {
      expect(listOrdersQuery.safeParse({ sort }).success).toBe(false);
    },
  );

  it.each(['up', 'ASC', ''])('rejects dir=%j', (dir) => {
    expect(listOrdersQuery.safeParse({ dir }).success).toBe(false);
  });

  it('still refuses an unknown parameter', () => {
    expect(listOrdersQuery.safeParse({ order: 'asc' }).success).toBe(false);
  });
});
