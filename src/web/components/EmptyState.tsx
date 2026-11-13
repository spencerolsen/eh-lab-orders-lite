import type { ReactNode } from 'react';

// Shown when a list has nothing in it, with an optional way forward (for
// example an "Add a patient" button).
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p>{message}</p>
      {action}
    </div>
  );
}
