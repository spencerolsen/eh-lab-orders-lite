// The orders page's filters and "Load more" (LAB-14), against a fake API that
// answers like the server: it filters, pages by offset and limit 25, and says
// hasMore.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import type { OrderListItem } from '../../shared/orders';
import type { Patient } from '../../shared/patients';
import { MemoryRouter, useLocation } from 'react-router';
import { App } from '../App';
import { renderApp, testQueryClient } from '../testing/render';

const JANE_1: Patient = {
  id: '20000000-0000-4000-8000-000000000001',
  firstName: 'Jane',
  lastName: 'Sample',
  dateOfBirth: '1984-03-09',
  email: 'jane1@example.test',
  phone: null,
};
const JANE_2: Patient = {
  ...JANE_1,
  id: '20000000-0000-4000-8000-000000000002',
  dateOfBirth: '1990-12-31',
  email: 'jane2@example.test',
};

function order(n: number, patient: Patient, status = 'ordered'): OrderListItem {
  return {
    id: `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    status: status as OrderListItem['status'],
    patient: {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
    },
    testCount: 1,
    totalCents: 2500,
    estimatedReadyDate: '2026-11-17',
    createdAt: '2026-11-13T19:00:00.000Z',
    createdAtClinic: '2026-11-13 12:00',
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// `orders` is newest first, as the server keeps it.
function fakeApi(orders: OrderListItem[]) {
  const fetch = vi.fn((url: string) => {
    const { pathname, searchParams } = new URL(url, 'http://localhost');
    if (pathname === '/healthz')
      return Promise.resolve(json(200, { status: 'ok' }));
    if (pathname === '/api/patients') {
      return Promise.resolve(json(200, [JANE_1, JANE_2]));
    }
    const byId = /^\/api\/patients\/(.+)$/.exec(pathname);
    if (byId) {
      const found = [JANE_1, JANE_2].find((p) => p.id === byId[1]);
      return Promise.resolve(found ? json(200, found) : json(404, {}));
    }
    if (pathname.startsWith('/api/orders/')) {
      return Promise.resolve(json(404, {}));
    }
    if (pathname === '/api/orders') {
      const status = searchParams.get('status');
      const patientId = searchParams.get('patientId');
      const offset = Number(searchParams.get('offset') ?? 0);
      const matching = orders.filter(
        (o) =>
          (!status || o.status === status) &&
          (!patientId || o.patient.id === patientId),
      );
      return Promise.resolve(
        json(200, {
          items: matching.slice(offset, offset + 25),
          hasMore: matching.length > offset + 25,
          clinicTimezone: 'America/Denver',
        }),
      );
    }
    return Promise.resolve(json(500, {}));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const orderCalls = (fetch: ReturnType<typeof fakeApi>) =>
  fetch.mock.calls
    .map(([url]) => url)
    .filter((url) => url.startsWith('/api/orders'));

// The patient filter's chosen patient (the table rows name patients too).
const chosenPatient = () =>
  screen
    .findByRole('button', { name: 'Remove patient filter' })
    .then((button) => button.parentElement!.textContent);

const bodyRows = () => screen.getAllByRole('row').length - 1;

it('shows Load more only when there is another page, and appends it', async () => {
  const thirty = Array.from({ length: 30 }, (_, i) => order(30 - i, JANE_1));
  const fetch = fakeApi(thirty);
  renderApp('/');
  await waitFor(() => expect(bodyRows()).toBe(25));
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(bodyRows()).toBe(30));
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  expect(orderCalls(fetch)).toEqual(['/api/orders', '/api/orders?offset=25']);
});

it('has no Load more for exactly one page of orders', async () => {
  fakeApi(Array.from({ length: 25 }, (_, i) => order(25 - i, JANE_1)));
  renderApp('/');
  await waitFor(() => expect(bodyRows()).toBe(25));
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
});

it('says no orders match when filters are set, and Clear filters restores the list', async () => {
  const fetch = fakeApi([order(1, JANE_1, 'ordered')]);
  renderApp('/?status=completed');
  expect(await screen.findByText('No orders match these filters')).toBeTruthy();
  expect(screen.queryByText('No orders yet')).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(bodyRows()).toBe(1));
  expect(orderCalls(fetch)).toEqual([
    '/api/orders?status=completed',
    '/api/orders',
  ]);
  expect(
    screen.getByLabelText<HTMLSelectElement>('Filter by status').value,
  ).toBe('');
});

it('says "No orders yet" when no filter is set', async () => {
  fakeApi([]);
  renderApp('/');
  expect(await screen.findByText('No orders yet')).toBeTruthy();
});

it('reads the status from the address and writes a choice back to it', async () => {
  const fetch = fakeApi([
    order(2, JANE_1, 'collected'),
    order(1, JANE_1, 'ordered'),
  ]);
  renderApp('/?status=collected');
  await waitFor(() => expect(bodyRows()).toBe(1));
  const select = screen.getByLabelText<HTMLSelectElement>('Filter by status');
  expect(select.value).toBe('collected');
  expect(
    within(select)
      .getAllByRole('option')
      .map((o) => o.textContent),
  ).toEqual(['All statuses', 'Ordered', 'Collected', 'Completed', 'Cancelled']);
  await userEvent.setup().selectOptions(select, 'ordered');
  await waitFor(() =>
    expect(orderCalls(fetch)).toContain('/api/orders?status=ordered'),
  );
});

it('ignores an invalid filter in the address', async () => {
  const fetch = fakeApi([order(1, JANE_1)]);
  renderApp('/?status=bogus&patientId=abc');
  await waitFor(() => expect(bodyRows()).toBe(1));
  expect(orderCalls(fetch)).toEqual(['/api/orders']);
});

it('picks a patient by name, telling same-name patients apart by date of birth', async () => {
  const fetch = fakeApi([order(2, JANE_2), order(1, JANE_1)]);
  renderApp('/');
  await waitFor(() => expect(bodyRows()).toBe(2));
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Filter by patient'), 'jane');
  const matches = await screen.findByRole('list', {
    name: 'Matching patients',
  });
  expect(
    within(matches)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual([
    'Jane Sample (born Mar 9, 1984)',
    'Jane Sample (born Dec 31, 1990)',
  ]);
  await user.click(within(matches).getAllByRole('button')[1]!);
  await waitFor(() => expect(bodyRows()).toBe(1));
  // Only the id is sent: never the name.
  expect(orderCalls(fetch).at(-1)).toBe(`/api/orders?patientId=${JANE_2.id}`);
  expect(await chosenPatient()).toContain('Jane Sample (born Dec 31, 1990)');
});

it('shows the patient from an id in the address, and the Remove button clears it', async () => {
  const fetch = fakeApi([order(2, JANE_2), order(1, JANE_1)]);
  renderApp(`/?patientId=${JANE_1.id}`);
  expect(
    await screen.findByText('Jane Sample (born Mar 9, 1984)'),
  ).toBeTruthy();
  await waitFor(() => expect(bodyRows()).toBe(1));
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Remove patient filter' }));
  await waitFor(() => expect(bodyRows()).toBe(2));
  expect(orderCalls(fetch).at(-1)).toBe('/api/orders');
  expect(screen.getByLabelText('Filter by patient')).toBeTruthy();
});

// Renders the app with the address shown, so a test can read it.
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

it('puts only the patient id in the address, never a name', async () => {
  fakeApi([order(1, JANE_1)]);
  const address = renderWithAddress('/');
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Filter by patient'), 'jane');
  const matches = await screen.findByRole('list', {
    name: 'Matching patients',
  });
  await user.click(within(matches).getAllByRole('button')[0]!);
  await waitFor(() => expect(address()).toBe(`?patientId=${JANE_1.id}`));
});

it('keeps the filters when an order is opened and closed', async () => {
  fakeApi([order(1, JANE_1)]);
  const address = renderWithAddress('/?status=ordered');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /View order/ }));
  await waitFor(() => expect(address()).toMatch(/order=/));
  expect(address()).toMatch(/status=ordered/);
  await user.click(await screen.findByRole('button', { name: 'Close' }));
  await waitFor(() => expect(address()).not.toMatch(/order=/));
  expect(address()).toBe('?status=ordered');
});
