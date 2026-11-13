import { describe, expect, it } from 'vitest';

import { ORDER_STATUSES, type OrderStatus } from '../../../shared/orders';
import {
  allowedNextStatuses,
  assertTransition,
  canCancel,
  InvalidTransitionError,
} from './transitions';

// Every (from, to) pair across the four statuses, written out: true is legal.
const LEGAL: Record<OrderStatus, Record<OrderStatus, boolean>> = {
  ordered: {
    ordered: false,
    collected: true,
    completed: false,
    cancelled: true,
  },
  collected: {
    ordered: false,
    collected: false,
    completed: true,
    cancelled: true,
  },
  completed: {
    ordered: false,
    collected: false,
    completed: false,
    cancelled: false,
  },
  cancelled: {
    ordered: false,
    collected: false,
    completed: false,
    cancelled: false,
  },
};

const PAIRS = ORDER_STATUSES.flatMap((from) =>
  ORDER_STATUSES.map((to) => ({ from, to, legal: LEGAL[from][to] })),
);

describe('assertTransition', () => {
  it.each(PAIRS)('$from to $to: legal is $legal', ({ from, to, legal }) => {
    if (legal) {
      expect(() => assertTransition(from, to)).not.toThrow();
    } else {
      expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
      expect(() => assertTransition(from, to)).toThrow(
        `An order cannot move from ${from} to ${to}`,
      );
    }
  });
});

describe('allowedNextStatuses and canCancel', () => {
  it.each([
    { status: 'ordered', next: ['collected'], cancel: true },
    { status: 'collected', next: ['completed'], cancel: true },
    { status: 'completed', next: [], cancel: false },
    { status: 'cancelled', next: [], cancel: false },
  ] as const)('$status', ({ status, next, cancel }) => {
    expect(allowedNextStatuses(status)).toEqual(next);
    expect(canCancel(status)).toBe(cancel);
  });
});
