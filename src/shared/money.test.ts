import { describe, expect, it } from 'vitest';

import { centsToDollarsText, formatCents, parseDollarsToCents } from './money';

describe('parseDollarsToCents', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['0.1', 10],
    ['19.99', 1999],
    // 0.29 * 100 is 28.999999999999996 in floating point.
    ['0.29', 29],
    ['0', 0],
    ['0.00', 0],
    [' 7.25 ', 725],
    ['007', 700],
  ])('reads %j as %j cents', (text, cents) => {
    expect(parseDollarsToCents(text)).toBe(cents);
  });

  it.each([
    '12.345',
    '1.005',
    '-1',
    '-0.50',
    '',
    '   ',
    '1,000',
    'abc',
    '12abc',
    '$12',
    '12.',
    '.5',
    '1e3',
    '1 000',
    '+5',
    'Infinity',
    '99999999999999999999',
  ])('rejects %j', (text) => {
    expect(parseDollarsToCents(text)).toBeNull();
  });
});

describe('formatCents', () => {
  it.each([
    [1250, '$12.50'],
    [1999, '$19.99'],
    [0, '$0.00'],
    [5, '$0.05'],
    [100, '$1.00'],
    [123456, '$1,234.56'],
    [-250, '-$2.50'],
  ])('shows %j cents as %j', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  it('round-trips with parseDollarsToCents', () => {
    for (const cents of [0, 1, 10, 99, 1999, 2500]) {
      expect(parseDollarsToCents(formatCents(cents).slice(1))).toBe(cents);
    }
  });
});

describe('centsToDollarsText', () => {
  it.each([
    [1250, '12.50'],
    [0, '0.00'],
    [5, '0.05'],
    [123456, '1234.56'],
    [2_147_483_647, '21474836.47'],
  ])('writes %i cents as %j', (cents, text) => {
    expect(centsToDollarsText(cents)).toBe(text);
  });

  it.each([0, 1, 99, 100, 1999, 2500, 2_147_483_647])(
    'reads back to the same cents through parseDollarsToCents (%i)',
    (cents) => {
      expect(parseDollarsToCents(centsToDollarsText(cents))).toBe(cents);
    },
  );
});
