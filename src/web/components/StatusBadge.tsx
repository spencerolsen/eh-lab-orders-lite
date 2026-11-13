// An order's status as a pill: the status word, always shown, with a tint per
// status (base.css, .badge-<status>) so colour is never the only signal.
// It takes the status as a plain string for now; LAB-11 types it with the
// shared list of order statuses in src/shared/.
export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}
