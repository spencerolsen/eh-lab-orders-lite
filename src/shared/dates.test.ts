import { afterEach, describe, expect, it } from 'vitest';

import { formatDate, isAfterDay, isRealDate, today } from './dates';

describe('isRealDate', () => {
  it.each([
    '2020-02-29',
    '2000-02-29',
    '2023-02-28',
    '1984-12-31',
    '0001-01-01',
  ])('accepts %s', (value) => {
    expect(isRealDate(value)).toBe(true);
  });

  it.each([
    ['2023-02-29', 'Feb 29 outside a leap year'],
    ['1900-02-29', 'a century that is not a leap year'],
    ['2020-02-30', 'Feb 30'],
    ['2020-04-31', 'Apr 31'],
    ['1984-13-01', 'month 13'],
    ['1984-00-10', 'month 0'],
    ['1984-01-00', 'day 0'],
    ['1984-01-32', 'day 32'],
    ['0000-01-01', 'year 0'],
    ['31/12/1990', 'another format'],
    ['1990-1-5', 'missing leading zeros'],
    ['', 'empty text'],
  ])('rejects %s (%s)', (value) => {
    expect(isRealDate(value)).toBe(false);
  });
});

it('isAfterDay compares calendar days given as strings', () => {
  expect(isAfterDay('2026-01-15', '2026-01-14')).toBe(true);
  expect(isAfterDay('2026-01-14', '2026-01-14')).toBe(false);
  expect(isAfterDay('2025-12-31', '2026-01-01')).toBe(false);
});

describe('today', () => {
  it('gives the calendar day in the given time zone, not in UTC', () => {
    // 23:59 in Denver (UTC-7 in January) is already 06:59 the next day in UTC.
    const now = new Date('2026-01-15T06:59:00Z');
    expect(today('America/Denver', now)).toBe('2026-01-14');
    expect(today('UTC', now)).toBe('2026-01-15');
  });

  it('moves to the next day at midnight in that time zone', () => {
    expect(today('America/Denver', new Date('2026-01-15T07:00:00Z'))).toBe(
      '2026-01-15',
    );
  });
});

describe('formatDate', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('writes the month as a word and drops leading zeros', () => {
    expect(formatDate('1984-03-09')).toBe('Mar 9, 1984');
    expect(formatDate('1990-12-31')).toBe('Dec 31, 1990');
  });

  it('gives the same day whatever the process time zone', () => {
    for (const tz of ['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
      process.env.TZ = tz;
      expect(formatDate('1984-03-09')).toBe('Mar 9, 1984');
      expect(formatDate('2000-01-01')).toBe('Jan 1, 2000');
    }
  });
});
