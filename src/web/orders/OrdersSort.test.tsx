// Sorting the orders list by column header (LAB-26), against a fake API that
// records the requests. The server sorts: the fake returns the same rows for
// every sort, so these tests check what is asked for, never row order.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import type { OrderListItem } from '../../shared/orders';
import { App } from '../App';
import { testQueryClient } from '../testing/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

function order(n: number): OrderListItem {
  return {
    id: `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    status: 'ordered',
    patient: {
      id: '20000000-0000-4000-8000-000000000001',
      firstName: 'Jane',
      lastName: 'Sample',
      dateOfBirth: '1984-03-09',
    },
    testCount: 1,
    totalCents: 2500,
    estimatedReadyDate: '2026-11-17',
    createdAt: '2026-11-13T19:00:00.000Z',
    createdAtClinic: '2026-11-13 12:00',
  };
}

// `total` orders; the fake pages like the server (limit 25 by default).
function fakeApi(total = 2) {
  const fetch = vi.fn((url: string) => {
    const { pathname, searchParams } = new URL(url, 'http://localhost');
    const offset = Number(searchParams.get('offset') ?? 0);
    const limit = Number(searchParams.get('limit') ?? 25);
    const items = Array.from({ length: total }, (_, i) =>
      order(total - i),
    ).slice(offset, offset + limit);
    const body =
      pathname === '/healthz'
        ? { status: 'ok' }
        : pathname === '/api/orders'
          ? {
              items,
              hasMore: offset + limit < total,
              clinicTimezone: 'America/Denver',
            }
          : pathname === '/api/patients'
            ? []
            : {};
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const orderCalls = (fetch: ReturnType<typeof fakeApi>) =>
  fetch.mock.calls
    .map(([url]) => url)
    .filter((url) => url.startsWith('/api/orders'));

function renderWithAddress(path: string) {
  function Address() {
    return <p data-testid="search">{useLocation().search}</p>;
  }
  render(
    <QueryClientProvider client={testQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Address />
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return () => screen.getByTestId('search').textContent;
}

const header = (name: string) =>
  screen.getByRole('columnheader', { name: new RegExp(name) });
const sortButton = (name: string) =>
  screen.findByRole('button', { name: new RegExp(`^Sort by ${name}`) });

it('Patient, Ready by, Status and Created headers are buttons; Tests and Total are plain text', async () => {
  fakeApi();
  renderWithAddress('/');
  for (const name of ['Patient', 'Ready by', 'Status', 'Created']) {
    expect(await sortButton(name)).toBeTruthy();
  }
  expect(screen.getAllByRole('button', { name: /^Sort by/ })).toHaveLength(4);
  for (const name of ['Tests', 'Total']) {
    const th = screen.getByRole('columnheader', { name });
    expect(th.querySelector('button')).toBeNull();
    expect(th.hasAttribute('aria-sort')).toBe(false);
  }
});

it('the default view marks Created descending and the others none', async () => {
  fakeApi();
  renderWithAddress('/');
  await sortButton('Created');
  expect(header('Created').getAttribute('aria-sort')).toBe('descending');
  for (const name of ['Patient', 'Ready by', 'Status']) {
    expect(header(name).getAttribute('aria-sort')).toBe('none');
  }
  // The direction is in the name too, not only in the arrow.
  expect(
    screen.getByRole('button', {
      name: 'Sort by Created (America/Denver), now descending',
    }),
  ).toBeTruthy();
});

it('a first click sorts ascending, except Created, which starts descending', async () => {
  const fetch = fakeApi();
  const address = renderWithAddress('/');
  const user = userEvent.setup();
  await user.click(await sortButton('Ready by'));
  await waitFor(() => expect(address()).toBe('?sort=readyBy&dir=asc'));
  expect(orderCalls(fetch).at(-1)).toBe('/api/orders?sort=readyBy&dir=asc');
  expect(header('Ready by').getAttribute('aria-sort')).toBe('ascending');
  expect(header('Created').getAttribute('aria-sort')).toBe('none');

  await user.click(await sortButton('Created'));
  // Created, descending, is the default: the address is clean again.
  await waitFor(() => expect(address()).toBe(''));
  expect(orderCalls(fetch).at(-1)).toBe('/api/orders');
});

it('a second click on the same header reverses the direction', async () => {
  const fetch = fakeApi();
  const address = renderWithAddress('/');
  const user = userEvent.setup();
  await user.click(await sortButton('Status'));
  await waitFor(() => expect(address()).toBe('?sort=status&dir=asc'));
  await user.click(await sortButton('Status'));
  await waitFor(() => expect(address()).toBe('?sort=status&dir=desc'));
  expect(orderCalls(fetch).at(-1)).toBe('/api/orders?sort=status&dir=desc');
  expect(header('Status').getAttribute('aria-sort')).toBe('descending');
});

it('clicking Created while it is the default reverses it to ascending', async () => {
  const fetch = fakeApi();
  const address = renderWithAddress('/');
  await userEvent.setup().click(await sortButton('Created'));
  await waitFor(() => expect(address()).toBe('?sort=created&dir=asc'));
  expect(orderCalls(fetch).at(-1)).toBe('/api/orders?sort=created&dir=asc');
});

it('reads the sort from the address', async () => {
  const fetch = fakeApi();
  renderWithAddress('/?sort=patient&dir=desc');
  await sortButton('Patient');
  expect(header('Patient').getAttribute('aria-sort')).toBe('descending');
  expect(orderCalls(fetch)).toEqual(['/api/orders?sort=patient&dir=desc']);
});

it('ignores an unknown sort or direction in the address, as unknown filters are', async () => {
  const fetch = fakeApi();
  renderWithAddress('/?sort=total&dir=sideways');
  await sortButton('Created');
  expect(header('Created').getAttribute('aria-sort')).toBe('descending');
  expect(orderCalls(fetch)).toEqual(['/api/orders']);
});

it('keeps the filters when the sort changes, and the sort when a filter changes', async () => {
  const fetch = fakeApi();
  const address = renderWithAddress('/?status=collected');
  const user = userEvent.setup();
  await user.click(await sortButton('Ready by'));
  await waitFor(() =>
    expect(address()).toBe('?status=collected&sort=readyBy&dir=asc'),
  );
  expect(orderCalls(fetch).at(-1)).toBe(
    '/api/orders?status=collected&sort=readyBy&dir=asc',
  );
  await user.selectOptions(
    screen.getByLabelText('Filter by status'),
    'ordered',
  );
  await waitFor(() =>
    expect(orderCalls(fetch).at(-1)).toBe(
      '/api/orders?status=ordered&sort=readyBy&dir=asc',
    ),
  );
});

const bodyRows = () => screen.getAllByRole('row').length - 1;

it('a new sort starts again from the first page, after Load more', async () => {
  const fetch = fakeApi(30);
  renderWithAddress('/');
  const user = userEvent.setup();
  await waitFor(() => expect(bodyRows()).toBe(25));
  await user.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(bodyRows()).toBe(30));
  expect(orderCalls(fetch).at(-1)).toBe('/api/orders?offset=25');

  await user.click(await sortButton('Patient'));
  await waitFor(() =>
    expect(orderCalls(fetch).at(-1)).toBe('/api/orders?sort=patient&dir=asc'),
  );
  // Back to one page: 25 rows and Load more again.
  await waitFor(() => expect(bodyRows()).toBe(25));
  expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy();
});

it('Load more after a sort carries the sort and direction', async () => {
  const fetch = fakeApi(30);
  renderWithAddress('/');
  const user = userEvent.setup();
  await user.click(await sortButton('Ready by'));
  await waitFor(() => expect(bodyRows()).toBe(25));
  await user.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(bodyRows()).toBe(30));
  expect(orderCalls(fetch).at(-1)).toBe(
    '/api/orders?sort=readyBy&dir=asc&offset=25',
  );
});

it('the sort buttons work from the keyboard and keep focus after the new sort loads', async () => {
  fakeApi();
  const address = renderWithAddress('/');
  const user = userEvent.setup();
  const button = await sortButton('Status');
  button.focus();
  await user.keyboard('{Enter}');
  await waitFor(() => expect(address()).toBe('?sort=status&dir=asc'));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /^Sort by Status/ }),
    ),
  );
  await user.keyboard(' ');
  await waitFor(() => expect(address()).toBe('?sort=status&dir=desc'));
});
