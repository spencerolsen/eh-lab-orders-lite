import type { ReactNode } from 'react';

import { describeError } from '../api/errors';

// Shown when a request failed: the plain-language message, ending with the
// request id when there is one, and a retry button when the caller gives a
// way to retry. role="alert" makes a screen reader announce it at once.
export function ErrorMessage({
  error,
  onRetry,
  children,
}: {
  error: unknown;
  onRetry?: () => void;
  // More lines under the message (the tests an order was refused for).
  children?: ReactNode;
}) {
  return (
    <div role="alert" className="error-message">
      <p>{describeError(error)}</p>
      {children}
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
