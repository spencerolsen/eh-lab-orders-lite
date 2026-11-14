import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { formatDate } from '../../shared/dates';
import { formatCents } from '../../shared/money';
import { describeError } from '../api/errors';
import { fetchQuote } from './api';

// The total and ready date of the tests chosen so far, worked out by the
// server (POST /api/orders/quote); nothing is calculated here. It asks again
// when the set of chosen tests changes, not on any other keystroke. While the
// new answer loads, the old numbers stay but are dimmed and marked "Updating",
// so they are not read as the current ones. A failed quote is a quiet line:
// "Submit order" does not depend on it, the create endpoint decides.
export function OrderPreview({ testIds }: { testIds: string[] }) {
  // Sorted: the answer does not depend on the order, so neither does the key.
  const ids = [...testIds].sort();
  const quote = useQuery({
    queryKey: ['order-quote', ids],
    queryFn: ({ signal }) => fetchQuote(ids, signal),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  });

  if (ids.length === 0) {
    return <p className="muted">Add a test to see the total</p>;
  }
  if (quote.isError) {
    return (
      <p className="muted" role="status">
        The total and ready date could not be shown.{' '}
        {describeError(quote.error)}
      </p>
    );
  }
  if (!quote.data) {
    return (
      <p className="muted" role="status">
        Calculating the total…
      </p>
    );
  }
  const stale = quote.isPlaceholderData;
  return (
    <div
      className={stale ? 'card muted' : 'card'}
      role="status"
      aria-busy={stale}
    >
      <p>
        Total: <strong>{formatCents(quote.data.totalCents)}</strong>
      </p>
      <p>
        Estimated ready date:{' '}
        <strong>{formatDate(quote.data.estimatedReadyDate)}</strong>
      </p>
      {stale && <p>Updating…</p>}
    </div>
  );
}
