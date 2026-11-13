import { describe, expect, it } from 'vitest';

import { calculateTotal } from './total';

const items = (...prices: number[]) =>
  prices.map((priceCents) => ({ priceCents }));

describe('calculateTotal', () => {
  it('is 0 for an empty list', () => {
    expect(calculateTotal([])).toBe(0);
  });

  it('is the price of a single item', () => {
    expect(calculateTotal(items(2500))).toBe(2500);
  });

  it('is the sum of many items', () => {
    // CBC + CMP + LIPID + A1C + TSH from the seeded catalog.
    expect(calculateTotal(items(2500, 4200, 3800, 3550, 4500))).toBe(18550);
  });

  it('counts a free item as 0', () => {
    expect(calculateTotal(items(0, 1999))).toBe(1999);
  });

  it('adds whole cents exactly, where adding dollars would not', () => {
    // 0.10 + 0.20 is 0.30000000000000004 in floating point.
    expect(calculateTotal(items(10, 20))).toBe(30);
    expect(calculateTotal(items(1999, 1, 1999, 1))).toBe(4000);
    const total = calculateTotal(items(19, 99, 1, 1, 33, 33, 34));
    expect(total).toBe(220);
    expect(Number.isInteger(total)).toBe(true);
  });

  it('is exact at the largest price a database integer holds', () => {
    const max = 2_147_483_647;
    expect(calculateTotal(items(max))).toBe(max);
    expect(calculateTotal(items(max, max, max))).toBe(6_442_450_941);
  });

  it('is exact up to Number.MAX_SAFE_INTEGER and throws beyond it', () => {
    expect(calculateTotal(items(Number.MAX_SAFE_INTEGER - 1, 1))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => calculateTotal(items(Number.MAX_SAFE_INTEGER, 1))).toThrow(
      RangeError,
    );
  });

  it.each([-1, 12.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'throws for a price of %s instead of returning a wrong total',
    (price) => {
      expect(() => calculateTotal(items(100, price))).toThrow(RangeError);
    },
  );
});
