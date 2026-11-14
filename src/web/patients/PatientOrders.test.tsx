// The patient page's order history (LAB-19). All values are fake.
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import type { OrderDetail, OrderList } from '../../shared/orders';
import { fakePatientsApi, SEEDED } from '../testing/fake-patients-api';
import { renderApp } from '../testing/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ID = '5eed0011-0000-4000-8000-000000000003';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const PID = '5eed0008-0000-4000-8000-000000000001';

const PATIENT = {
  id: PID,
  firstName: 'Demo',
  lastName: 'Example',
  dateOfBirth: '2020-02-29',
};

const LIST: OrderList = {
  items: [
    {
      id: ID,
      status: 'collected',
      patient: PATIENT,
      testCount: 2,
      totalCents: 5600,
      estimatedReadyDate: '2026-11-03',
      createdAt: '2026-10-30T18:00:00.000Z',
      createdAtClinic: '2026-10-30 12:00',
    },
    {
      id: '5eed0011-0000-4000-8000-000000000004',
      status: 'ordered',
      patient: PATIENT,
      testCount: 1,
      totalCents: 2500,
      estimatedReadyDate: '2026-11-05',
      createdAt: '2026-10-29T18:00:00.000Z',
      createdAtClinic: '2026-10-29 12:00',
    },
  ],
  hasMore: false,
  clinicTimezone: 'America/Denver',
};

const DETAIL: OrderDetail = {
  id: ID,
  status: 'collected',
  patient: { ...PATIENT, email: null, phone: null },
  items: [
    {
      labTestId: '5eed0003-0000-4000-8000-000000000001',
      testCode: 'CBC',
      testName: 'Complete Blood Count',
      priceCents: 2500,
      turnaroundDays: 1,
    },
  ],
  totalCents: 2500,
  estimatedReadyDate: '2026-11-03',
  createdAt: LIST.items[0]!.createdAt,
  createdAtClinic: LIST.items[0]!.createdAtClinic,
  clinicTimezone: 'America/Denver',
  allowedNextStatuses: ['completed'],
  canCancel: true,
  cancellation: null,
};

// The patients fake, plus one order's response (GET /api/orders/:id).
function fakeApi(orders: () => Response = () => json(200, LIST)) {
  const patients = fakePatientsApi([{ ...SEEDED[0]!, id: PID }], orders);
  const answer = patients.getMockImplementation()!;
  const fetch = vi.fn((url: string, init?: RequestInit) =>
    url === `/api/orders/${ID}`
      ? Promise.resolve(json(200, DETAIL))
      : answer(url, init),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const ordersUrls = (fetch: ReturnType<typeof fakeApi>) =>
  fetch.mock.calls
    .map(([url]) => url)
    .filter((u) => u.startsWith('/api/orders'));

it('PatientOrders renders one row per order with status, ready date, total and test count', async () => {
  const fetch = fakeApi();
  renderApp(`/patients/${PID}`);
  const rows = await screen.findAllByRole('row');
  // The header and the two orders; the list asked for this patient only.
  expect(rows).toHaveLength(3);
  expect(ordersUrls(fetch)).toEqual([`/api/orders?patientId=${PID}`]);
  const first = within(rows[1]!);
  expect(first.getByText('Collected')).toBeTruthy();
  expect(first.getByText('Nov 3, 2026')).toBeTruthy();
  expect(first.getByText('$56.00')).toBeTruthy();
  expect(first.getByText('2')).toBeTruthy();
  expect(within(rows[2]!).getByText('Ordered')).toBeTruthy();
  // The patient is the page's, so the table has no Patient column.
  expect(screen.queryByRole('columnheader', { name: 'Patient' })).toBeNull();
});

it('PatientOrders shows "No orders yet" for an empty list', async () => {
  fakeApi(() => json(200, { ...LIST, items: [] }));
  renderApp(`/patients/${PID}`);
  expect(await screen.findByText('No orders yet')).toBeTruthy();
});

it('PatientOrders shows a message with the request id when the request fails', async () => {
  fakeApi(() =>
    json(500, {
      error: { code: 'INTERNAL', message: 'Boom', requestId: 'req-orders-9' },
    }),
  );
  renderApp(`/patients/${PID}`);
  expect(await screen.findByText(/req-orders-9/)).toBeTruthy();
  // The form above still works.
  await userEvent.type(
    screen.getByLabelText('Email', { exact: false }),
    'demo@example.test',
  );
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
});

it('PatientOrders row click sets the order search parameter and renders OrderDetailPanel', async () => {
  fakeApi();
  renderApp(`/patients/${PID}`);
  await userEvent.click(await screen.findByRole('cell', { name: '$56.00' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Order' }));
  expect(await dialog.findByText('CBC')).toBeTruthy();
  expect(dialog.getByText('Total $25.00')).toBeTruthy();
  // Close returns to the patient page.
  await userEvent.click(dialog.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog', { name: 'Order' })).toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
    'Demo Example',
  );
});

it('PatientPage in create mode does not render PatientOrders', async () => {
  const fetch = fakeApi();
  renderApp('/patients/new');
  await screen.findByRole('button', { name: 'Save patient' });
  expect(screen.queryByRole('heading', { name: 'Orders' })).toBeNull();
  expect(ordersUrls(fetch)).toEqual([]);
});

it('PatientPage with ?order=<id> renders OrderDetailPanel on load', async () => {
  fakeApi();
  renderApp(`/patients/${PID}?order=${ID}`);
  const dialog = within(await screen.findByRole('dialog', { name: 'Order' }));
  expect(await dialog.findByText('CBC')).toBeTruthy();
});
