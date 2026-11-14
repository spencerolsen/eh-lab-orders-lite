// The order status transition table (LAB-15). Pure: no framework, no database.
// This is the only list of legal moves; the endpoint's allowedNextStatuses and
// canCancel, and the status and cancel actions (LAB-16, LAB-17), all read it.
import type { OrderStatus } from '../../../shared/orders';

// Where each status may go next. Keyed by OrderStatus, so a new status without
// an entry is a type error. completed and cancelled are final.
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  ordered: ['collected', 'cancelled'],
  collected: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// Thrown for a move the table does not allow. Names both statuses only.
export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`An order cannot move from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

// The forward moves: every legal target except cancelled.
export function allowedNextStatuses(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from].filter((status) => status !== 'cancelled');
}

export function canCancel(from: OrderStatus): boolean {
  return canTransition(from, 'cancelled');
}
