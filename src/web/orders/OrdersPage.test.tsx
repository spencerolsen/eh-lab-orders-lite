import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import type { OrderList, OrderListItem } from '../../shared/orders';
import { renderApp } from '../testing/render';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// A fake API: /healthz is fine and GET /api/orders answers with `orders`
// (or the responses given, one per call).
function fakeApi(...responses: Response[]) {
  const fetch = vi.fn((url: string) => {
    if (url === '/healthz') return Promise.resolve(json(200, { status: 'ok' }));
    return Promise.resolve(responses.shift() ?? json(500, {}));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function list(items: OrderListItem[], clinicTimezone = 'America/Denver') {
  const body: OrderList = { items, hasMore: false, clinicTimezone };
  return json(200, body);
}

const FRIDAY_NOON: OrderListItem = {
  id: '5eed0011-0000-4000-8000-000000000003',
  status: 'collected',
  patient: {
    id: '5eed0008-0000-4000-8000-000000000002',
    firstName: 'Sample',
    lastName: 'Person',
    dateOfBirth: '1990-12-31',
  },
  testCount: 2,
  totalCents: 5600,
  estimatedReadyDate: '2026-11-03',
  // Noon in Denver; 6 pm in UTC and 3 am the next day in Tokyo.
  createdAt: '2026-10-30T18:00:00.000Z',
  createdAtClinic: '2026-10-30 12:00',
};

const OLDER: OrderListItem = {
  ...FRIDAY_NOON,
  id: '5eed0011-0000-4000-8000-000000000004',
  status: 'completed',
  patient: { ...FRIDAY_NOON.patient, firstName: 'Demo', lastName: 'Example' },
  testCount: 1,
  totalCents: 123456,
  estimatedReadyDate: '2026-10-28',
  createdAt: '2026-10-26T16:00:00.000Z',
  createdAtClinic: '2026-10-26 10:00',
};

function cellTexts(): (string | null)[][] {
  return screen
    .getAllByRole('row')
    .map((row) =>
      Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent),
    );
}

it('shows each order as a row, in the order the server sent them', async () => {
  fakeApi(list([FRIDAY_NOON, OLDER]));
  renderApp('/');
  expect(await screen.findByRole('table')).toBeTruthy();
  expect(cellTexts()).toEqual([
    [
      'Patient',
      'Tests',
      'Total',
      'Ready by',
      'Status',
      'Created (America/Denver)',
      'Details',
    ],
    [
      'Sample Person (born Dec 31, 1990)',
      '2',
      '$56.00',
      'Nov 3, 2026',
      'Collected',
      'Oct 30, 2026, 12:00 pm',
      'View',
    ],
    [
      'Demo Example (born Dec 31, 1990)',
      '1',
      '$1,234.56',
      'Oct 28, 2026',
      'Completed',
      'Oct 26, 2026, 10:00 am',
      'View',
    ],
  ]);
  const badge = within(screen.getAllByRole('row')[1]!).getByText('Collected');
  expect(badge.className).toBe('badge badge-collected');
});

it('links each patient to their patient page', async () => {
  fakeApi(list([FRIDAY_NOON]));
  renderApp('/');
  const link = await screen.findByRole('link', {
    name: 'Sample Person (born Dec 31, 1990)',
  });
  expect(link.getAttribute('href')).toBe(
    '/patients/5eed0008-0000-4000-8000-000000000002',
  );
});

it('shows the clinic’s created time and names its time zone, whatever the browser’s zone', async () => {
  // createdAt alone, read in this browser, would not be 12:00 unless the
  // browser were in Denver; the page shows createdAtClinic as sent.
  fakeApi(list([FRIDAY_NOON], 'Pacific/Honolulu'));
  renderApp('/');
  expect(
    await screen.findByRole('columnheader', {
      name: 'Created (Pacific/Honolulu)',
    }),
  ).toBeTruthy();
  expect(screen.getByText('Oct 30, 2026, 12:00 pm')).toBeTruthy();
});

it('shows "No orders yet" when there are none', async () => {
  fakeApi(list([]));
  renderApp('/');
  expect(await screen.findByText('No orders yet')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});

it('shows loading while the list is on its way', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url === '/healthz'
        ? Promise.resolve(json(200, { status: 'ok' }))
        : new Promise<Response>(() => {}),
    ),
  );
  renderApp('/');
  expect(await screen.findByText('Loading orders…')).toBeTruthy();
});

it('shows the error with its reference, and Try again loads the list', async () => {
  const fetch = fakeApi(
    json(500, {
      error: { code: 'INTERNAL_ERROR', message: 'x', requestId: 'req-orders' },
    }),
    list([FRIDAY_NOON]),
  );
  renderApp('/');
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Reference: req-orders',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('table')).toBeTruthy();
  expect(
    fetch.mock.calls.filter(([url]) => url === '/api/orders'),
  ).toHaveLength(2);
});

it('keeps the ready date and the created time on one line each', async () => {
  fakeApi(list([FRIDAY_NOON]));
  renderApp('/');
  await screen.findByRole('table');
  const row = screen.getAllByRole('row')[1]!;
  for (const text of ['Nov 3, 2026', 'Oct 30, 2026, 12:00 pm']) {
    expect(within(row).getByText(text).className).toBe('nowrap');
  }
});

it('lets a long unbroken patient name wrap inside its cell', async () => {
  fakeApi(list([FRIDAY_NOON]));
  renderApp('/');
  const label = await screen.findByText('Sample Person (born Dec 31, 1990)');
  expect(label.className).toBe('wrap');
});
