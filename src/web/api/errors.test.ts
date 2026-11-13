import { describe, expect, it } from 'vitest';

import { ApiError, UNREACHABLE_CODE, UNREACHABLE_MESSAGE } from './client';
import {
  describeError,
  SERVER_ERROR_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
} from './errors';

describe('describeError', () => {
  it('describeError appends the request id', () => {
    const error = new ApiError(
      422,
      'TEST_RULE',
      'This order cannot be placed',
      'req-7',
    );
    expect(describeError(error)).toBe(
      'This order cannot be placed. Reference: req-7',
    );
  });

  it.each([400, 409, 422])('shows the server message for a %i', (status) => {
    const error = new ApiError(
      status,
      'SOME_CODE',
      'The server says why',
      'req-1',
    );
    expect(describeError(error)).toBe('The server says why. Reference: req-1');
  });

  it.each([500, 503])(
    'shows a generic message for a %i, still with the reference',
    (status) => {
      const error = new ApiError(
        status,
        'INTERNAL_ERROR',
        'Something went wrong on our side',
        'req-2',
      );
      expect(describeError(error)).toBe(
        `${SERVER_ERROR_MESSAGE} Reference: req-2`,
      );
    },
  );

  it('shows "can\'t reach the server" with no reference when there is no request id', () => {
    const error = new ApiError(502, UNREACHABLE_CODE, UNREACHABLE_MESSAGE);
    expect(describeError(error)).toBe("Can't reach the server. Try again.");
  });

  it('shows a generic message for something that is not an ApiError', () => {
    expect(describeError(new Error('x is undefined'))).toBe(
      UNEXPECTED_ERROR_MESSAGE,
    );
    expect(describeError('a string')).toBe(UNEXPECTED_ERROR_MESSAGE);
  });
});
