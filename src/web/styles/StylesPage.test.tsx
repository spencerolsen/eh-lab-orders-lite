import { screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderApp } from '../testing/render';

it('the styles page renders every shared style without throwing', () => {
  renderApp('/styles');
  // The page itself, not the footer (which has its own status line).
  const main = within(screen.getByRole('main'));
  expect(
    screen.getByRole('heading', { level: 1, name: 'Styles' }),
  ).toBeTruthy();
  for (const section of [
    'Headings',
    'Buttons',
    'Form fields',
    'Table',
    'Status badges',
    'Loading, empty and error',
    'Dialog and panel',
  ]) {
    expect(
      screen.getByRole('heading', { level: 2, name: section }),
    ).toBeTruthy();
  }
  for (const status of ['ordered', 'collected', 'completed', 'cancelled']) {
    expect(screen.getAllByText(status).length).toBeGreaterThan(0);
  }
  // The invalid field is marked by aria-invalid and its message, not colour.
  const code = screen.getByLabelText('Code');
  expect(code.getAttribute('aria-invalid')).toBe('true');
  expect(code.getAttribute('aria-describedby')).toContain('sample-code-error');
  expect(screen.getByText('Use letters and digits only.')).toBeTruthy();
  expect(main.getByRole('status').textContent).toBe('Loading samples…');
  expect(main.getByRole('alert').textContent).toContain(
    'Reference: req-sample',
  );
  // The plain table, and the one with an inactive row and row buttons.
  expect(screen.getAllByRole('table')).toHaveLength(2);
  expect(screen.getByLabelText<HTMLInputElement>('Locked code').disabled).toBe(
    true,
  );
});

it('the styles page is not linked from the menu', () => {
  renderApp('/styles');
  const nav = screen.getByRole('navigation', { name: 'Main' });
  const hrefs = [...nav.querySelectorAll('a')].map((a) =>
    a.getAttribute('href'),
  );
  expect(hrefs).not.toContain('/styles');
  expect(nav.querySelector('[aria-current="page"]')).toBeNull();
});
