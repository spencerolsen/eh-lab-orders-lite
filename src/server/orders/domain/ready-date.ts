// The estimated ready date rule (LAB-11). Pure: no framework, no database, and
// no clock of its own. The caller reads the time once and passes it in, so the
// stored created_at and the ready date come from the same moment, and the same
// inputs always give the same date.
import { daysInMonth, today } from '../../../shared/dates';

// A calendar day as plain numbers. Calendar arithmetic is done on these, never
// on a JavaScript Date, whose day depends on the time zone it is read in.
type Day = { year: number; month: number; day: number };

function parseDay(value: string): Day {
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return { year, month, day };
}

function formatDay({ year, month, day }: Day): string {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function nextDay({ year, month, day }: Day): Day {
  if (day < daysInMonth(year, month)) return { year, month, day: day + 1 };
  if (month < 12) return { year, month: month + 1, day: 1 };
  return { year: year + 1, month: 1, day: 1 };
}

// 0 is Sunday, 6 is Saturday, for any date on the Gregorian calendar
// (Sakamoto's method: whole-number arithmetic only).
const MONTH_OFFSETS = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;
function dayOfWeek({ year, month, day }: Day): number {
  const y = month < 3 ? year - 1 : year;
  return (
    (y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      MONTH_OFFSETS[month - 1]! +
      day) %
    7
  );
}

// Saturday and Sunday are not business days. Public holidays are not handled;
// they would be one more parameter, a list of 'YYYY-MM-DD' days to skip,
// checked here.
function isBusinessDay(day: Day): boolean {
  const weekday = dayOfWeek(day);
  return weekday !== 0 && weekday !== 6;
}

// READY DATE: the ready date is the Nth business day after the day the order
// was placed, where N is the longest turnaround among the order's tests (the
// tests run in parallel). Saturday and Sunday are not business days. The order
// day itself is never counted.
// - "The day the order was placed" is the calendar day of `orderedAt` in the
//   clinic's time zone (CLINIC_TIMEZONE), not UTC and not the server's:
//   11:30 pm Thursday in the clinic is Thursday.
// - So ordered Monday, 1 day: Tuesday. Ordered Friday, Saturday or Sunday,
//   1 day: Monday (all three are ready the same day).
// Calculated once, when the order is placed, and stored on the order.
// Returns 'YYYY-MM-DD'. Throws for an empty list (an order has at least one
// test) and for a turnaround that is not a whole number of days, 1 or more.
export function estimateReadyDate(
  orderedAt: Date,
  items: readonly { turnaroundDays: number }[],
  timeZone: string,
): string {
  if (items.length === 0) {
    throw new RangeError('An order needs at least one test');
  }
  let longest = 0;
  for (const { turnaroundDays } of items) {
    if (!Number.isSafeInteger(turnaroundDays) || turnaroundDays < 1) {
      throw new RangeError(
        'A turnaround must be a whole number of days, 1 or more',
      );
    }
    longest = Math.max(longest, turnaroundDays);
  }

  // Start on the order day, which is never counted, and step forward one
  // day at a time, counting only business days.
  let day = parseDay(today(timeZone, orderedAt));
  let counted = 0;
  while (counted < longest) {
    day = nextDay(day);
    if (isBusinessDay(day)) counted += 1;
  }
  return formatDay(day);
}
