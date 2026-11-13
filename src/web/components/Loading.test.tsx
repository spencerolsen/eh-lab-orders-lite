import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Loading } from './Loading';

it('Loading is a status a screen reader announces, with a default or given label', () => {
  const { unmount } = render(<Loading />);
  expect(screen.getByRole('status').textContent).toBe('Loading…');
  unmount();

  render(<Loading label="Loading patients…" />);
  expect(screen.getByRole('status').textContent).toBe('Loading patients…');
});
