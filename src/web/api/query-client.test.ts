import { describe, expect, it } from 'vitest';

import { ApiError, UNREACHABLE_CODE, UNREACHABLE_MESSAGE } from './client';
import { createQueryClient, shouldRetry } from './query-client';

const unreachable = new ApiError(0, UNREACHABLE_CODE, UNREACHABLE_MESSAGE);

describe('shouldRetry', () => {
  it('retries a network error once', () => {
    expect(shouldRetry(0, unreachable)).toBe(true);
    expect(shouldRetry(1, unreachable)).toBe(false);
  });

  it.each([400, 404, 409, 422])('does not retry a %i', (status) => {
    expect(shouldRetry(0, new ApiError(status, 'CODE', 'm', 'req-1'))).toBe(
      false,
    );
  });

  it('does not retry a 500 or an error that is not an ApiError', () => {
    expect(
      shouldRetry(0, new ApiError(500, 'INTERNAL_ERROR', 'm', 'req-1')),
    ).toBe(false);
    expect(shouldRetry(0, new Error('bug'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('uses shouldRetry, no refetch on window focus, and never retries a change', () => {
    const { queries, mutations } = createQueryClient().getDefaultOptions();
    expect(queries?.retry).toBe(shouldRetry);
    expect(queries?.refetchOnWindowFocus).toBe(false);
    expect(mutations?.retry).toBe(false);
  });
});
