import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ValidationError } from './errors';
import { parse } from './parse';

const body = z.strictObject({
  name: z.string().min(1, 'is required'),
  priceCents: z.number().int().min(0, 'must be at least 0'),
  address: z.strictObject({ city: z.string() }).optional(),
});

function problems(input: unknown) {
  try {
    parse(body, input);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).details;
  }
  throw new Error('parse did not throw');
}

describe('parse', () => {
  it('returns the parsed value when the input is valid', () => {
    expect(parse(body, { name: 'CBC', priceCents: 1250 })).toEqual({
      name: 'CBC',
      priceCents: 1250,
    });
  });

  it('zod failure becomes field details', () => {
    expect(problems({ name: '', priceCents: -1 })).toEqual([
      { field: 'name', reason: 'is required' },
      { field: 'priceCents', reason: 'must be at least 0' },
    ]);
  });

  it('names a nested field by its path', () => {
    expect(
      problems({ name: 'A', priceCents: 1, address: { city: 5 } }),
    ).toEqual([
      { field: 'address.city', reason: expect.any(String) as string },
    ]);
  });

  it('unknown field is rejected', () => {
    expect(
      problems({ name: 'A', priceCents: 1, isAdmin: true, extra: 1 }),
    ).toEqual([
      { field: 'isAdmin', reason: 'is not an allowed field' },
      { field: 'extra', reason: 'is not an allowed field' },
    ]);
  });

  it('reports input that is not an object at all', () => {
    expect(problems('not json')).toEqual([
      { field: '(input)', reason: expect.any(String) as string },
    ]);
  });
});
