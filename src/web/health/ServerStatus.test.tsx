import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { renderApp, stubFetch } from '../testing/render';

// The footer is on every page. These tests count /healthz requests, so they
// use the not-found page, which makes none of its own (the home page loads
// the orders, and the styles page has its own status and alert).
const PAGE_WITHOUT_REQUESTS = '/no-such-page';

it('shows the server is connected when /healthz answers ok', async () => {
  const fetch = stubFetch(200, { status: 'ok' });
  renderApp(PAGE_WITHOUT_REQUESTS);
  expect(screen.getByRole('status').textContent).toBe('Checking the server…');
  expect(await screen.findByText('Server: connected')).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith(
    '/healthz',
    expect.objectContaining({ method: 'GET' }),
  );
});

it('shows "Can\'t reach the server" after one retry when the API is down', async () => {
  const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
  vi.stubGlobal('fetch', fetch);
  renderApp(PAGE_WITHOUT_REQUESTS);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("Can't reach the server. Try again.");
  expect(fetch).toHaveBeenCalledTimes(2); // the first try and one retry

  // The retry button asks again; this time the API answers.
  stubFetch(200, { status: 'ok' });
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Server: connected')).toBeTruthy();
});

it('shows the server message and request id of a 422, without retrying', async () => {
  const fetch = stubFetch(422, {
    error: {
      code: 'TEST_RULE',
      message: 'That is not allowed',
      requestId: 'req-422',
    },
  });
  renderApp(PAGE_WITHOUT_REQUESTS);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(
    'That is not allowed. Reference: req-422',
  );
  expect(fetch).toHaveBeenCalledOnce();
});
