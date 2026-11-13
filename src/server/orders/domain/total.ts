// The order total rule (LAB-11). Pure: no framework, no database.

// TOTAL: the sum of the frozen price_cents on the order's items, in whole
// cents. It is derived every time and never stored, and this is its only
// implementation: the list query returns each order's item prices and the row
// mapper passes them through here (there is no SQL SUM). An empty list is 0.
//
// Integer addition only, never dollars or floating point. A price that is not
// a whole number of cents, 0 or more, or a total too large to hold exactly
// (over Number.MAX_SAFE_INTEGER), throws instead of returning a wrong amount.
export function calculateTotal(
  items: readonly { priceCents: number }[],
): number {
  let total = 0;
  for (const { priceCents } of items) {
    if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
      throw new RangeError(
        'A price must be a whole number of cents, 0 or more',
      );
    }
    total += priceCents;
  }
  if (!Number.isSafeInteger(total)) {
    throw new RangeError('The total is too large to hold exactly');
  }
  return total;
}
