import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { renderApp } from './testing/render';

function currentSections(): string[] {
  const links = screen
    .getByRole('navigation', { name: 'Main' })
    .querySelectorAll('a');
  return [...links]
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent ?? '');
}

it('menu bar marks the current section', async () => {
  renderApp('/patients');
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect([...nav.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
    'Orders',
    'Patients',
    'Catalog',
  ]);
  expect(currentSections()).toEqual(['Patients']);

  // Clicking a link changes the page in place (no reload in a MemoryRouter).
  await userEvent.click(screen.getByRole('link', { name: 'Catalog' }));
  expect(
    screen.getByRole('heading', { level: 1, name: 'Lab tests' }),
  ).toBeTruthy();
  expect(currentSections()).toEqual(['Catalog']);

  await userEvent.click(screen.getByRole('link', { name: 'Orders' }));
  expect(
    screen.getByRole('heading', { level: 1, name: 'Orders' }),
  ).toBeTruthy();
  expect(currentSections()).toEqual(['Orders']);
});

it('keeps a section current on a page under it, and Orders only on /', () => {
  renderApp('/patients/some-id');
  expect(currentSections()).toEqual(['Patients']);
});
