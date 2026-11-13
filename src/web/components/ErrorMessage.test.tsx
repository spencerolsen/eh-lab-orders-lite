import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { ApiError } from '../api/client';
import { ErrorMessage } from './ErrorMessage';

const error = new ApiError(
  409,
  'DUPLICATE',
  'This code already exists',
  'req-9',
);

it('ErrorMessage shows a retry button only when given a retry function', async () => {
  const { unmount } = render(<ErrorMessage error={error} />);
  expect(screen.getByRole('alert').textContent).toBe(
    'This code already exists Reference: req-9',
  );
  expect(screen.queryByRole('button')).toBeNull();
  unmount();

  const onRetry = vi.fn();
  render(<ErrorMessage error={error} onRetry={onRetry} />);
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledOnce();
});
