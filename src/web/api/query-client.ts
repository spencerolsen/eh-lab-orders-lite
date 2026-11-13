import { QueryClient } from '@tanstack/react-query';

import { ApiError, UNREACHABLE_CODE } from './client';

// One retry when the server could not be reached (it may be restarting);
// none for anything else: a 4xx would fail the same way again, and a 5xx is
// shown at once with its reference. failureCount is 0 after the first failure.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return (
    failureCount < 1 &&
    error instanceof ApiError &&
    error.code === UNREACHABLE_CODE
  );
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false },
      // A change (creating an order, say) is never repeated on its own.
      mutations: { retry: false },
    },
  });
}
