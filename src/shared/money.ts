// Money is whole cents everywhere (integers in the database, the API and the
// code). Only the screen shows dollars, and these two helpers are the only
// place the two meet.

// "12", "12.5" and "12.50" -> 1200, 1250, 1250. Returns null for anything
// else: a minus sign, more than two decimals, commas, spaces inside, text, or
// an empty string. It works on the digits as text, never through floating
// point, so "19.99" is exactly 1999 (19.99 * 100 is 1998.9999999999998).
export function parseDollarsToCents(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const [, dollars = '', fraction = ''] = match;
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  // A huge number of dollars would lose digits as a JavaScript number.
  return Number.isSafeInteger(cents) ? cents : null;
}

// 1250 -> "$12.50", 0 -> "$0.00", 123456 -> "$1,234.56".
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}

// 1250 -> "12.50", 0 -> "0.00", 123456 -> "1234.56": a price in dollars as a
// form field holds it, with no "$" and no commas, so parseDollarsToCents reads
// it back to the same cents.
export function centsToDollarsText(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
