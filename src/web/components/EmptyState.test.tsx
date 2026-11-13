import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

it('EmptyState shows the message and the action when one is given', () => {
  const { unmount } = render(<EmptyState message="No patients yet." />);
  expect(screen.getByText('No patients yet.')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  unmount();

  render(
    <EmptyState
      message="No patients yet."
      action={<button type="button">Add a patient</button>}
    />,
  );
  expect(screen.getByRole('button', { name: 'Add a patient' })).toBeTruthy();
});
