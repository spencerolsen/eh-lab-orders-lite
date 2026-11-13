import { ORDER_STATUS_LABELS, type OrderStatus } from '../../shared/orders';

// An order's status as a pill: the status's label, always shown, with a tint
// per status (base.css, .badge-<status>) so colour is never the only signal.
// The statuses and their labels come from src/shared/orders.ts.
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
