import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { renderApp } from './testing/render';

it('not found route shows the page not found screen', async () => {
  renderApp('/does-not-exist');
  expect(
    screen.getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeTruthy();
  // The menu bar is still there, with no section marked current.
  expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();

  await userEvent.click(
    screen.getByRole('link', { name: 'Go to the orders page' }),
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'Orders' }),
  ).toBeTruthy();
});

it.each([
  { path: '/', heading: 'Orders' },
  { path: '/patients', heading: 'Patients' },
  { path: '/catalog', heading: 'Lab tests' },
])('shows the $heading page at $path', ({ path, heading }) => {
  renderApp(path);
  expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
});
