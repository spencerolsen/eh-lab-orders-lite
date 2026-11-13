import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never {
  throw new Error('render failed');
}

it('error boundary renders the fallback when a child throws', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <Broken />
    </ErrorBoundary>,
  );

  expect(
    screen.getByRole('heading', { name: 'Something went wrong.' }),
  ).toBeTruthy();
  expect(screen.getByText('Reload the page.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
  // The boundary writes the error itself to the console.
  expect(consoleError).toHaveBeenCalledWith(
    'The app crashed while rendering',
    expect.objectContaining({ message: 'render failed' }),
    expect.any(String),
  );
});

it('renders its children when nothing throws', () => {
  render(
    <ErrorBoundary>
      <p>All good</p>
    </ErrorBoundary>,
  );
  expect(screen.getByText('All good')).toBeTruthy();
  expect(screen.queryByText('Reload the page.')).toBeNull();
});
