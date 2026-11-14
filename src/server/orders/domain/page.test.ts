import { expect, it } from 'vitest';

import { toPage } from './page';

it('has no more rows when fewer than the limit came back', () => {
  expect(toPage([1, 2], 3)).toEqual({ items: [1, 2], hasMore: false });
});

it('has no more rows when exactly the limit came back', () => {
  expect(toPage([1, 2, 3], 3)).toEqual({ items: [1, 2, 3], hasMore: false });
});

it('has more rows when one more than the limit came back, and drops it', () => {
  expect(toPage([1, 2, 3, 4], 3)).toEqual({ items: [1, 2, 3], hasMore: true });
});

it('handles no rows', () => {
  expect(toPage([], 3)).toEqual({ items: [], hasMore: false });
});
