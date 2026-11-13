// Calendar days as 'YYYY-MM-DD' strings. A calendar day (a date of birth, a
// ready date) is never turned into a JavaScript Date: a Date is a moment, and
// reading it back in another time zone can move it to the day before or after.

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// True for a 'YYYY-MM-DD' string that names a day on the calendar: month 1 to
// 12, a day that exists in that month (2020-02-29 yes, 2023-02-29 and
// 2020-02-30 no), and a year from 0001 (Postgres has no year 0).
export function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

// True when `date` is a later day than `today` (both 'YYYY-MM-DD'). Strings
// of this form sort the same way as the days they name.
export function isAfterDay(date: string, today: string): boolean {
  return date > today;
}

// The calendar day of the moment `now` in `timeZone` (an IANA name such as
// America/Denver), as 'YYYY-MM-DD'. The server passes CLINIC_TIMEZONE and its
// injected clock; the browser passes its own time zone and new Date().
export function today(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// '1984-03-09' becomes 'Mar 9, 1984', by splitting the string: no Date is
// built, so the result is the same in every time zone.
export function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return `${MONTH_NAMES[month - 1] ?? '?'} ${day}, ${year}`;
}
