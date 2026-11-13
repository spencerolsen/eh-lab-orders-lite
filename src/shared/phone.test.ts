import { describe, expect, it } from 'vitest';

import {
  formatPhone,
  normalizePhone,
  PHONE_CHARACTERS_REASON,
  PHONE_LENGTH_REASON,
  phoneProblem,
} from './phone';

describe('parsing a typed phone number', () => {
  it.each([
    '(801) 555-0101',
    '801-555-0101',
    '801.555.0101',
    '+1 801 555 0101',
    '18015550101',
    '8015550101',
  ])('accepts %j and keeps the 10 digits', (typed) => {
    expect(phoneProblem(typed)).toBeUndefined();
    expect(normalizePhone(typed)).toBe('8015550101');
  });

  it.each([
    ['5550101', '7 digits'],
    ['801555010', '9 digits'],
    ['28015550101', '11 digits not starting with 1'],
    ['118015550101', '12 digits'],
    ['', 'empty'],
    ['() -', 'formatting only'],
  ])('refuses %j (%s): it needs 10 digits with the area code', (typed) => {
    expect(phoneProblem(typed)).toBe(PHONE_LENGTH_REASON);
  });

  it.each([
    'abc',
    '801 555 01OO',
    '801/555/0101',
    '1+8015550101',
    '801\u00005550101',
  ])('refuses %j: letters and other characters are not dropped', (typed) => {
    expect(phoneProblem(typed)).toBe(PHONE_CHARACTERS_REASON);
  });
});

describe('formatPhone', () => {
  it('shows a stored number as (801) 555-0101', () => {
    expect(formatPhone('8015550101')).toBe('(801) 555-0101');
  });

  it('shows anything that is not 10 digits as it is', () => {
    expect(formatPhone('5550101')).toBe('5550101');
  });
});
