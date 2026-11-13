// The ready-date rule: the ready date is the Nth business day after the day
// the order was placed, where N is the longest turnaround among the order's
// tests. Saturday and Sunday are not business days. The order day itself is
// never counted.
//
// Every order time is an instant (a UTC ISO string), and
// the clinic's time zone decides its calendar day. In November 2026 Denver is
// UTC-7, so noon in the clinic is 19:00 UTC. The week used most:
//   Mon 2026-11-09  Tue 10  Wed 11  Thu 12  Fri 13  Sat 14  Sun 15
//   Mon 2026-11-16  Tue 17  Wed 18
// These tests are also run with TZ set to other zones (docs/testing.md): the
// result must not depend on the process's own time zone.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { estimateReadyDate } from './ready-date';

const DENVER = 'America/Denver';

// Noon in Denver on `day` (a November 2026 or other UTC-7 day).
const noonDenver = (day: string) => new Date(`${day}T19:00:00Z`);

const tests = (...turnarounds: number[]) =>
  turnarounds.map((turnaroundDays) => ({ turnaroundDays }));

const ready = (orderedAt: Date, ...turnarounds: number[]) =>
  estimateReadyDate(orderedAt, tests(...turnarounds), DENVER);

describe('estimateReadyDate: each day of the week, 1-day turnaround', () => {
  it.each([
    ['Monday', '2026-11-09', '2026-11-10'],
    ['Tuesday', '2026-11-10', '2026-11-11'],
    ['Wednesday', '2026-11-11', '2026-11-12'],
    ['Thursday', '2026-11-12', '2026-11-13'],
    ['Friday', '2026-11-13', '2026-11-16'],
    ['Saturday', '2026-11-14', '2026-11-16'],
    ['Sunday', '2026-11-15', '2026-11-16'],
  ])('ordered %s %s is ready %s', (_weekday, day, expected) => {
    expect(ready(noonDenver(day), 1)).toBe(expected);
  });
});

describe('estimateReadyDate: the worked examples, 2-day turnaround', () => {
  it.each([
    ['Monday', '2026-11-09', 'Wednesday', '2026-11-11'],
    ['Thursday', '2026-11-12', 'Monday', '2026-11-16'],
    ['Friday', '2026-11-13', 'Tuesday', '2026-11-17'],
    // The first business day after a weekend order day is Monday.
    ['Saturday', '2026-11-14', 'Tuesday', '2026-11-17'],
    ['Sunday', '2026-11-15', 'Tuesday', '2026-11-17'],
  ])('ordered %s %s is ready %s %s', (_weekday, day, _readyDay, expected) => {
    expect(ready(noonDenver(day), 2)).toBe(expected);
  });

  it.each([1, 2, 5])(
    'the same order placed on Friday, Saturday or Sunday is ready the same day (%s-day turnaround)',
    (turnaround) => {
      const dates = ['2026-11-13', '2026-11-14', '2026-11-15'].map((day) =>
        ready(noonDenver(day), turnaround),
      );
      expect(new Set(dates).size).toBe(1);
    },
  );

  it('Friday, Saturday and Sunday with 2 days are all ready Tuesday; Monday with 2 days is Wednesday', () => {
    expect(
      ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'].map((day) =>
        ready(noonDenver(day), 2),
      ),
    ).toEqual(['2026-11-17', '2026-11-17', '2026-11-17', '2026-11-18']);
  });
});

describe('estimateReadyDate: several tests on one order', () => {
  it('uses the longest turnaround, not the shortest or the sum', () => {
    // Monday with 1 and 5: five business days later is the next Monday
    // (the shortest would give Tuesday, the sum of 6 the next Tuesday).
    expect(ready(noonDenver('2026-11-09'), 1, 5)).toBe('2026-11-16');
    expect(ready(noonDenver('2026-11-09'), 5, 1)).toBe('2026-11-16');
  });

  it('gives the same date when the longest test appears among many shorter ones', () => {
    expect(ready(noonDenver('2026-11-09'), 2, 1, 3, 2, 1)).toBe('2026-11-12');
  });
});

describe('estimateReadyDate: longer spans over weekends', () => {
  it('a 5-day turnaround from Wednesday crosses one weekend', () => {
    expect(ready(noonDenver('2026-11-11'), 5)).toBe('2026-11-18');
  });

  it('a 10-day turnaround from Thursday crosses two weekends', () => {
    expect(ready(noonDenver('2026-11-12'), 10)).toBe('2026-11-26');
  });

  it('a 15-day turnaround from Friday crosses three weekends and a month end', () => {
    expect(ready(noonDenver('2026-11-13'), 15)).toBe('2026-12-04');
  });

  it('the longest turnaround a test may have (365 business days)', () => {
    // 365 business days is 73 full weeks (511 days), so a Monday 73 weeks on.
    expect(ready(noonDenver('2026-11-09'), 365)).toBe('2028-04-03');
  });
});

describe('estimateReadyDate: the order day is the clinic’s calendar day', () => {
  it('11:30 pm Thursday in the clinic is Thursday, though it is already Friday in UTC', () => {
    const lateThursday = new Date('2026-11-13T06:30:00Z');
    expect(ready(lateThursday, 1)).toBe('2026-11-13');
  });

  it('12:30 am Friday in the clinic is Friday', () => {
    const earlyFriday = new Date('2026-11-13T07:30:00Z');
    expect(ready(earlyFriday, 1)).toBe('2026-11-16');
  });

  it('11:30 pm Friday and 12:30 am Saturday in the clinic are both ready Monday with 1 day', () => {
    expect(ready(new Date('2026-11-14T06:30:00Z'), 1)).toBe('2026-11-16');
    expect(ready(new Date('2026-11-14T07:30:00Z'), 1)).toBe('2026-11-16');
  });

  it('Saturday 02:00 UTC (Friday 7 pm in the clinic) is ready Tuesday with 2 days, the same as a Saturday order', () => {
    // Friday and Saturday orders agree under this rule, so this case cannot
    // tell the clinic day from the UTC day; the Thursday cases above can.
    expect(ready(new Date('2026-11-14T02:00:00Z'), 2)).toBe('2026-11-17');
  });

  it('the same instant is a different day under a different clinic time zone', () => {
    // 16:00 UTC Thursday is 9 am Thursday in Denver and 1 am Friday in Tokyo.
    const instant = new Date('2026-11-12T16:00:00Z');
    expect(estimateReadyDate(instant, tests(1), DENVER)).toBe('2026-11-13');
    expect(estimateReadyDate(instant, tests(1), 'Asia/Tokyo')).toBe(
      '2026-11-16',
    );
  });

  it('uses the clinic’s offset after a daylight-saving change', () => {
    // Denver is UTC-7 from 2026-11-01. 06:30 UTC on Tuesday 11-03 is 11:30 pm
    // Monday 11-02 (with the summer offset it would be 12:30 am Tuesday).
    expect(ready(new Date('2026-11-03T06:30:00Z'), 1)).toBe('2026-11-03');
  });
});

describe('estimateReadyDate: calendar edges', () => {
  it('crosses a year boundary', () => {
    // Thursday 2026-12-31; 2027-01-01 is a Friday (holidays are not skipped).
    expect(ready(noonDenver('2026-12-31'), 1)).toBe('2027-01-01');
    expect(ready(noonDenver('2026-12-31'), 2)).toBe('2027-01-04');
  });

  it('knows February 29 in a leap year', () => {
    // Friday 2028-02-25 plus 2 business days: Monday the 28th, Tuesday the 29th.
    expect(ready(noonDenver('2028-02-25'), 2)).toBe('2028-02-29');
    // Friday 2027-02-26 plus 2: Monday March 1, Tuesday March 2.
    expect(ready(noonDenver('2027-02-26'), 2)).toBe('2027-03-02');
  });

  it('agrees with an independent UTC calculation for every day from 2020 to 2031', () => {
    // A second, independent implementation over a whole range of days, so a
    // wrong weekday for any date (or a wrong month length) is found. Both use
    // the UTC time zone, so the clinic day of noon UTC is that day.
    const DAY_MS = 86_400_000;
    const isWeekend = (ms: number) => [0, 6].includes(new Date(ms).getUTCDay());
    const reference = (startMs: number, turnaround: number) => {
      let ms = startMs;
      for (let counted = 0; counted < turnaround;) {
        ms += DAY_MS;
        if (!isWeekend(ms)) counted += 1;
      }
      return new Date(ms).toISOString().slice(0, 10);
    };
    const mismatches: string[] = [];
    const end = Date.UTC(2031, 11, 31);
    for (let ms = Date.UTC(2020, 0, 1, 12); ms <= end; ms += DAY_MS) {
      for (const turnaround of [1, 4]) {
        const actual = estimateReadyDate(
          new Date(ms),
          tests(turnaround),
          'UTC',
        );
        const expected = reference(ms, turnaround);
        if (actual !== expected)
          mismatches.push(`${new Date(ms).toISOString()} +${turnaround}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('estimateReadyDate: no clock of its own', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives the same date for the same inputs, whatever the time is now', () => {
    const orderedAt = noonDenver('2026-11-13');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2001-01-01T00:00:00Z'));
    const first = ready(orderedAt, 2);
    vi.setSystemTime(new Date('2099-06-15T12:00:00Z'));
    const second = ready(orderedAt, 2);
    expect([first, second]).toEqual(['2026-11-17', '2026-11-17']);
  });
});

describe('estimateReadyDate: refused inputs', () => {
  it('throws for an order with no tests', () => {
    expect(() =>
      estimateReadyDate(noonDenver('2026-11-09'), [], DENVER),
    ).toThrow('An order needs at least one test');
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'throws for a turnaround of %s',
    (turnaround) => {
      expect(() => ready(noonDenver('2026-11-09'), 2, turnaround)).toThrow(
        RangeError,
      );
    },
  );
});
