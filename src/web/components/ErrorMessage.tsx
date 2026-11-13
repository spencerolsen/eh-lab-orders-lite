import { describeError } from '../api/errors';

// Shown when a request failed: the plain-language message, ending with the
// request id when there is one, and a retry button when the caller gives a
// way to retry. role="alert" makes a screen reader announce it at once.
export function ErrorMessage({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="error-message">
      <p>{describeError(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
