// "New order for this patient" on the patient page (LAB-20), and the other
// entry point, "Place new order" on the orders page, with a fake API.
// All values are fake.
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import type { LabTest } from '../../shared/lab-tests';
import type { OrderListItem } from '../../shared/orders';
import { fakePatientsApi, SEEDED } from '../testing/fake-patients-api';
import { renderApp } from '../testing/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

const PID = '5eed0020-0000-4000-8000-000000000001';
const PATIENT = { ...SEEDED[0]!, id: PID };
const CBC: LabTest = {
  id: '5eed0020-0000-4000-8000-0000000000c1',
  code: 'CBC',
  name: 'Complete Blood Count',
  priceCents: 2500,
  turnaroundDays: 1,
  isActive: true,
};
const PLACED: OrderListItem = {
  id: '5eed0020-0000-4000-8000-0000000000a1',
  status: 'ordered',
  patient: {
    id: PID,
    firstName: PATIENT.firstName,
    lastName: PATIENT.lastName,
    dateOfBirth: PATIENT.dateOfBirth,
  },
  testCount: 1,
  totalCents: 2500,
  estimatedReadyDate: '2026-11-17',
  createdAt: '2026-11-13T19:00:00.000Z',
  createdAtClinic: '2026-11-13 12:00',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// The patients fake, plus the catalog and POST /api/orders. The order list
// holds the orders placed so far.
function fakeApi() {
  const placed: OrderListItem[] = [];
  const patients = fakePatientsApi([PATIENT], () =>
    json(200, { items: placed, hasMore: false, clinicTimezone: 'UTC' }),
  );
  const answer = patients.getMockImplementation()!;
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/lab-tests') return Promise.resolve(json(200, [CBC]));
    if (url === '/api/orders' && init?.method === 'POST') {
      placed.unshift(PLACED);
      return Promise.resolve(json(201, PLACED));
    }
    return answer(url, init);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const keys = (fetch: ReturnType<typeof fakeApi>) =>
  fetch.mock.calls
    .filter(([url, init]) => url === '/api/orders' && init?.method === 'POST')
    .map(
      ([, init]) =>
        (init!.headers as Record<string, string>)['Idempotency-Key'],
    );

const dialog = () => screen.getByRole('dialog', { name: 'New order' });
const quickAdd = () => screen.getByRole('combobox', { name: 'Add a test' });

async function placeOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.type(quickAdd(), 'cbc{ArrowDown}{Enter}');
  await user.click(screen.getByRole('button', { name: 'Submit order' }));
}

it('"New order for this patient" opens the modal with that patient chosen and the focus in quick-add', async () => {
  fakeApi();
  const user = userEvent.setup();
  renderApp(`/patients/${PID}`);
  await user.click(
    await screen.findByRole('button', { name: 'New order for this patient' }),
  );
  expect(
    within(dialog()).getByText('Demo Example (born Feb 29, 2020)'),
  ).toBeTruthy();
  expect(within(dialog()).queryByLabelText('Patient')).toBeNull();
  // The box is usable once the catalog has loaded, and takes the focus then.
  await vi.waitFor(() => expect(document.activeElement).toBe(quickAdd()));

  // Change turns it back into the patient search, and quick-add waits.
  await user.click(within(dialog()).getByRole('button', { name: 'Change' }));
  expect(within(dialog()).getByLabelText('Patient')).toBeTruthy();
  expect((quickAdd() as HTMLInputElement).disabled).toBe(true);
});

it('"Place new order" on the orders page opens the modal with no patient chosen', async () => {
  fakeApi();
  const user = userEvent.setup();
  renderApp('/');
  await user.click(
    await screen.findByRole('button', { name: 'Place new order' }),
  );
  expect(within(dialog()).getByLabelText('Patient')).toBeTruthy();
  expect(within(dialog()).queryByRole('button', { name: 'Change' })).toBeNull();
  expect((quickAdd() as HTMLInputElement).disabled).toBe(true);
});

it('the patient page has the one button, and no other page has it', async () => {
  fakeApi();
  renderApp('/patients');
  await screen.findByRole('heading', { level: 1, name: 'Patients' });
  expect(
    screen.queryByRole('button', { name: 'New order for this patient' }),
  ).toBeNull();
});

it('there is no "New order" button or link in the menu bar, on any page', async () => {
  fakeApi();
  for (const path of ['/', '/patients', `/patients/${PID}`, '/catalog']) {
    const { unmount } = renderApp(path);
    await screen.findByRole('heading', { level: 1 });
    const menuBar = screen.getByRole('banner');
    expect(within(menuBar).queryByRole('button')).toBeNull();
    expect(within(menuBar).queryByText(/new order/i)).toBeNull();
    unmount();
  }
});

it('an order placed from the patient page closes the modal and shows in the history without a reload', async () => {
  const fetch = fakeApi();
  const user = userEvent.setup();
  renderApp(`/patients/${PID}`);
  expect(await screen.findByText('No orders yet')).toBeTruthy();
  await user.click(
    screen.getByRole('button', { name: 'New order for this patient' }),
  );
  await placeOrder(user);

  expect(await screen.findByText('Ordered')).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'New order' })).toBeNull();
  expect(screen.queryByText('No orders yet')).toBeNull();
  // It was placed for this page's patient.
  const post = fetch.mock.calls.find(
    ([url, init]) => url === '/api/orders' && init?.method === 'POST',
  )!;
  expect(JSON.parse(post[1]!.body as string)).toEqual({
    patientId: PID,
    labTestIds: [CBC.id],
  });
});

it('each opening of the modal sends a new idempotency key, from the patient page', async () => {
  const fetch = fakeApi();
  const user = userEvent.setup();
  renderApp(`/patients/${PID}`);
  for (let i = 0; i < 2; i++) {
    await user.click(
      await screen.findByRole('button', { name: 'New order for this patient' }),
    );
    await placeOrder(user);
    await vi.waitFor(() => expect(keys(fetch)).toHaveLength(i + 1));
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New order' })).toBeNull(),
    );
  }
  const [first, second] = keys(fetch);
  expect(first).toBeTruthy();
  expect(second).toBeTruthy();
  expect(first).not.toBe(second);
});

it('each opening of the modal sends a new idempotency key, from the orders page', async () => {
  const fetch = fakeApi();
  const user = userEvent.setup();
  renderApp('/');
  for (let i = 0; i < 2; i++) {
    await user.click(
      await screen.findByRole('button', { name: 'Place new order' }),
    );
    await user.type(screen.getByLabelText('Patient'), 'demo');
    await user.click(
      await screen.findByRole('button', {
        name: 'Demo Example (born Feb 29, 2020)',
      }),
    );
    await placeOrder(user);
    await vi.waitFor(() => expect(keys(fetch)).toHaveLength(i + 1));
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New order' })).toBeNull(),
    );
  }
  const [first, second] = keys(fetch);
  expect(first).toBeTruthy();
  expect(first).not.toBe(second);
});
