import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';

import type { OrderDetail, OrderList } from '../../shared/orders';
import { App } from '../App';
import { renderApp, testQueryClient } from '../testing/render';

const ID = '5eed0011-0000-4000-8000-000000000003';
const MISSING = '5eed0011-0000-4000-8000-0000000000ff';

function json(status: number, body: unknown, headers = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const DETAIL: OrderDetail = {
  id: ID,
  status: 'collected',
  patient: {
    id: '5eed0008-0000-4000-8000-000000000002',
    firstName: 'Sample',
    lastName: 'Person',
    dateOfBirth: '1990-12-31',
    email: null,
    phone: null,
  },
  items: [
    {
      labTestId: '5eed0003-0000-4000-8000-000000000001',
      testCode: 'CBC',
      testName: 'Complete Blood Count',
      priceCents: 2500,
      turnaroundDays: 1,
    },
    {
      labTestId: '5eed0003-0000-4000-8000-000000000002',
      testCode: 'LIPID',
      testName: 'Lipid Panel',
      priceCents: 3100,
      turnaroundDays: 2,
    },
  ],
  totalCents: 5600,
  estimatedReadyDate: '2026-11-03',
  createdAt: '2026-10-30T18:00:00.000Z',
  createdAtClinic: '2026-10-30 12:00',
  clinicTimezone: 'Pacific/Honolulu',
  allowedNextStatuses: ['completed'],
  canCancel: true,
};

const LIST: OrderList = {
  items: [
    {
      id: ID,
      status: 'collected',
      patient: {
        id: DETAIL.patient.id,
        firstName: 'Sample',
        lastName: 'Person',
        dateOfBirth: '1990-12-31',
      },
      testCount: 2,
      totalCents: 5600,
      estimatedReadyDate: '2026-11-03',
      createdAt: DETAIL.createdAt,
      createdAtClinic: DETAIL.createdAtClinic,
    },
  ],
  hasMore: false,
  clinicTimezone: 'Pacific/Honolulu',
};

// A fake API: the list, and one order's response by id (404 for any other).
function fakeApi(order: () => Response = () => json(200, DETAIL)) {
  const fetch = vi.fn((url: string) => {
    if (url === '/healthz') return Promise.resolve(json(200, { status: 'ok' }));
    if (url === '/api/orders') return Promise.resolve(json(200, LIST));
    if (url === `/api/orders/${ID}`) return Promise.resolve(order());
    return Promise.resolve(
      json(404, {
        error: { code: 'NOT_FOUND', message: 'No such order', requestId: 'r1' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const panel = () => screen.findByRole('dialog', { name: 'Order' });

it('opens from the address and shows the order', async () => {
  fakeApi();
  renderApp(`/?order=${ID}`);
  const dialog = within(await panel());
  expect(
    await dialog.findByText('Sample Person (born Dec 31, 1990)'),
  ).toBeTruthy();
  expect(dialog.getByText('Collected')).toBeTruthy();
  expect(dialog.getByText('CBC')).toBeTruthy();
  expect(dialog.getByText('Lipid Panel')).toBeTruthy();
  expect(dialog.getByText('$25.00')).toBeTruthy();
  expect(dialog.getByText('Total $56.00')).toBeTruthy();
  expect(dialog.getByText('Nov 3, 2026')).toBeTruthy();
  // The clinic's zone, as the API sent it, labels the created time.
  expect(dialog.getByText('Created (Pacific/Honolulu)')).toBeTruthy();
  expect(dialog.getByText('Oct 30, 2026, 12:00 pm')).toBeTruthy();
  // The one move a collected order allows (LAB-16), and Close.
  expect(dialog.getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Mark completed',
    'Close',
  ]);
});

it('opens when a row is clicked and puts the order in the address', async () => {
  const fetch = fakeApi();
  renderApp('/');
  await userEvent.click(await screen.findByRole('cell', { name: '$56.00' }));
  expect(await panel()).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith(`/api/orders/${ID}`, expect.anything());
});

it('opens from the keyboard with the View button, and Escape closes it and returns focus', async () => {
  fakeApi();
  renderApp('/');
  const view = await screen.findByRole('button', {
    name: 'View order for Sample Person',
  });
  view.focus();
  await userEvent.keyboard('{Enter}');
  await panel();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(view));
  // The list is still there and usable.
  expect(screen.getByRole('table')).toBeTruthy();
});

it('closes with the Close button', async () => {
  fakeApi();
  renderApp(`/?order=${ID}`);
  const dialog = within(await panel());
  await userEvent.click(await dialog.findByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByRole('table')).toBeTruthy();
});

it('says "Order not found" for an order that does not exist', async () => {
  fakeApi();
  renderApp(`/?order=${MISSING}`);
  const dialog = within(await panel());
  expect(await dialog.findByText('Order not found')).toBeTruthy();
  expect(dialog.getByRole('button', { name: 'Close' })).toBeTruthy();
  expect(await screen.findByRole('table')).toBeTruthy();
});

it('says "Order not found" for an address that is not an id, without a request', async () => {
  const fetch = fakeApi();
  renderApp('/?order=not-an-id');
  const dialog = within(await panel());
  expect(await dialog.findByText('Order not found')).toBeTruthy();
  expect(fetch).not.toHaveBeenCalledWith(
    '/api/orders/not-an-id',
    expect.anything(),
  );
});

it('shows an error with the request id when the call fails', async () => {
  fakeApi(() =>
    json(500, {
      error: { code: 'INTERNAL_ERROR', message: 'Oops', requestId: 'req-42' },
    }),
  );
  renderApp(`/?order=${ID}`);
  const dialog = within(await panel());
  expect(
    await dialog.findByText(/req-42/, undefined, { timeout: 4000 }),
  ).toBeTruthy();
});

it('shows loading while the order is on its way', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url === '/healthz'
        ? Promise.resolve(json(200, { status: 'ok' }))
        : new Promise<Response>(() => {}),
    ),
  );
  renderApp(`/?order=${ID}`);
  const dialog = within(await panel());
  expect(dialog.getByText('Loading order…')).toBeTruthy();
});

// Opening adds a history entry and puts the order in the address; going back
// removes it and closes the panel.
it('keeps the open order in the address, and the back button closes it', async () => {
  fakeApi();
  function Probe() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <p data-testid="search">{location.search}</p>
        <button type="button" onClick={() => void navigate(-1)}>
          Browser back
        </button>
      </>
    );
  }
  render(
    <QueryClientProvider client={testQueryClient()}>
      <MemoryRouter initialEntries={['/']}>
        <Probe />
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole('cell', { name: '$56.00' }));
  await panel();
  expect(screen.getByTestId('search').textContent).toBe(`?order=${ID}`);
  await userEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByTestId('search').textContent).toBe('');
  expect(screen.getByRole('table')).toBeTruthy();
});

// Closing replaces the entry opening added, so Back does not reopen the panel.
it('does not reopen the panel when going back after closing it', async () => {
  fakeApi();
  function Back() {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => void navigate(-1)}>
        Browser back
      </button>
    );
  }
  render(
    <QueryClientProvider client={testQueryClient()}>
      <MemoryRouter initialEntries={['/']}>
        <Back />
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole('cell', { name: '$56.00' }));
  await panel();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await userEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('table')).toBeTruthy();
});

// React's development mode runs every effect twice; the panel must stay open
// (closing it on that first clean-up once removed ?order= from the address).
it('stays open under StrictMode', async () => {
  fakeApi();
  render(
    <StrictMode>
      <QueryClientProvider client={testQueryClient()}>
        <MemoryRouter initialEntries={[`/?order=${ID}`]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
  const dialog = within(await panel());
  expect(await dialog.findByText('Total $56.00')).toBeTruthy();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.getByRole('dialog', { name: 'Order' })).toBeTruthy();
});
