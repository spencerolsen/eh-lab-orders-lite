// Phone numbers: US numbers with an area code (an owner decision; numbers
// from other countries are not supported). Stored as exactly 10 digits, shown
// as (801) 555-0101.

// What a phone may be typed with: digits, spaces, dashes, dots, parentheses
// and one leading +. A letter is refused, not dropped: '801 555 01OO' is a
// typo, and dropping the letters would store a different number.
const PHONE_CHARACTERS = /^\+?[0-9 ().-]*$/;

export const PHONE_CHARACTERS_REASON =
  'may contain only digits, spaces, dashes, dots, parentheses and a leading +';
export const PHONE_LENGTH_REASON =
  'must be a 10-digit number, including the area code';

// The digits, with the US country code 1 dropped from an 11-digit number:
// '+1 (801) 555-0101' and '(801) 555-0101' both become '8015550101'. Run it
// only on a phone that passed phoneProblem.
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits;
}

// Why a typed phone number is not acceptable, or undefined when it is: after
// the formatting is removed it must be 10 digits, or 11 starting with 1.
export function phoneProblem(value: string): string | undefined {
  if (!PHONE_CHARACTERS.test(value.trim())) return PHONE_CHARACTERS_REASON;
  if (!/^\d{10}$/.test(normalizePhone(value))) return PHONE_LENGTH_REASON;
  return undefined;
}

// A stored phone for the screen: '8015550101' becomes '(801) 555-0101'.
// Anything that is not 10 digits is shown as it is.
export function formatPhone(stored: string): string {
  const match = /^(\d{3})(\d{3})(\d{4})$/.exec(stored);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : stored;
}
