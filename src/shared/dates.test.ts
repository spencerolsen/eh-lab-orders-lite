import { afterEach, describe, expect, it } from 'vitest';

import {
  clinicDateTime,
  formatDate,
  formatDateTime,
  isAfterDay,
  isRealDate,
  latestTodayAnywhere,
  today,
} from './dates';

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

it('latestTodayAnywhere is the day in UTC+14, never behind any other zone', () => {
  // 07:30 UTC on Jan 15: Jan 14 in Los Angeles, Jan 15 in Denver, and
  // already 21:30 on Jan 15 in Kiritimati.
  const now = new Date('2026-01-15T07:30:00Z');
  expect(latestTodayAnywhere(now)).toBe('2026-01-15');
  // 10:30 UTC: it is Jan 16 in Kiritimati, while Denver is still on Jan 15.
  expect(latestTodayAnywhere(new Date('2026-01-15T10:30:00Z'))).toBe(
    '2026-01-16',
  );
  for (const zone of ['UTC', 'Pacific/Auckland', 'Pacific/Pago_Pago']) {
    expect(isAfterDay(today(zone, now), latestTodayAnywhere(now))).toBe(false);
  }
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

describe('clinicDateTime', () => {
  it('gives the wall clock of the moment in the time zone', () => {
    const moment = new Date('2026-10-30T18:00:00Z');
    expect(clinicDateTime('America/Denver', moment)).toBe('2026-10-30 12:00');
    expect(clinicDateTime('UTC', moment)).toBe('2026-10-30 18:00');
    expect(clinicDateTime('Asia/Tokyo', moment)).toBe('2026-10-31 03:00');
  });

  it('writes midnight as 00:00, not 24:00', () => {
    expect(
      clinicDateTime('America/Denver', new Date('2026-11-14T07:00:00Z')),
    ).toBe('2026-11-14 00:00');
  });
});

describe('formatDateTime', () => {
  it.each([
    ['2026-10-30 12:00', 'Oct 30, 2026, 12:00 pm'],
    ['2026-10-30 00:05', 'Oct 30, 2026, 12:05 am'],
    ['2026-11-13 23:30', 'Nov 13, 2026, 11:30 pm'],
    ['2026-01-02 09:07', 'Jan 2, 2026, 9:07 am'],
  ])('%s is shown as %s', (value, expected) => {
    expect(formatDateTime(value)).toBe(expected);
  });
});
