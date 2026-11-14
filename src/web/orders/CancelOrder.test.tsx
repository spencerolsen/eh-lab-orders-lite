// Cancelling an order from the panel (LAB-17): the action only where the
// server says it can be cancelled, the form inside the panel, the checks
// before sending, the cancelled state, the list refresh, and the 409 and 422
// answers.
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import type { OrderDetail, OrderList, OrderStatus } from '../../shared/orders';
import { renderApp } from '../testing/render';

const ID = '5eed0011-0000-4000-8000-000000000003';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// What the fake server keeps of the order.
type State = {
  status: OrderStatus;
  cancellation: OrderDetail['cancellation'];
};

// The answers the real server gives (the server decides; this fake repeats
// its table only to answer like it would).
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  ordered: ['collected'],
  collected: ['completed'],
  completed: [],
  cancelled: [],
};

const CANCELLATION = {
  note: 'Patient asked to reschedule',
  cancelledBy: 'Sample Staff',
  cancelledAt: '2026-11-12T17:05:00.000Z',
  cancelledAtClinic: '2026-11-12 10:05',
};

function detail({ status, cancellation }: State): OrderDetail {
  return {
    id: ID,
    status,
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
    ],
    totalCents: 2500,
    estimatedReadyDate: '2026-11-03',
    createdAt: '2026-10-30T18:00:00.000Z',
    createdAtClinic: '2026-10-30 12:00',
    clinicTimezone: 'America/Denver',
    allowedNextStatuses: NEXT[status],
    canCancel: status === 'ordered' || status === 'collected',
    cancellation,
  };
}

function list(state: State): OrderList {
  const order = detail(state);
  return {
    items: [
      {
        id: ID,
        status: state.status,
        patient: {
          id: order.patient.id,
          firstName: 'Sample',
          lastName: 'Person',
          dateOfBirth: '1990-12-31',
        },
        testCount: 1,
        totalCents: 2500,
        estimatedReadyDate: order.estimatedReadyDate,
        createdAt: order.createdAt,
        createdAtClinic: order.createdAtClinic,
      },
    ],
    hasMore: false,
    clinicTimezone: 'America/Denver',
  };
}

// A fake API holding one order. `onCancel` answers the POST; by default it
// cancels the order and returns it, as the server does.
function fakeApi(
  start: OrderStatus,
  onCancel?: (state: State) => Response | Promise<Response>,
) {
  const state: State = {
    status: start,
    cancellation: start === 'cancelled' ? CANCELLATION : null,
  };
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/healthz') return Promise.resolve(json(200, { status: 'ok' }));
    if (url === '/api/orders') return Promise.resolve(json(200, list(state)));
    if (url === `/api/orders/${ID}`) {
      return Promise.resolve(json(200, detail(state)));
    }
    if (url === `/api/orders/${ID}/cancel` && init?.method === 'POST') {
      if (onCancel) return Promise.resolve(onCancel(state));
      const body = JSON.parse(init.body as string) as {
        note: string;
        cancelledBy: string;
      };
      state.status = 'cancelled';
      state.cancellation = { ...CANCELLATION, ...body };
      return Promise.resolve(json(200, detail(state)));
    }
    return Promise.resolve(json(500, {}));
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, state };
}

const panel = async () =>
  within(await screen.findByRole('dialog', { name: 'Order' }));

type Panel = Awaited<ReturnType<typeof panel>>;

function buttons(dialog: Panel): string[] {
  return dialog.getAllByRole('button').map((b) => b.textContent);
}

function cancelPosts(fetch: ReturnType<typeof fakeApi>['fetch']) {
  return fetch.mock.calls.filter(([url]) => url === `/api/orders/${ID}/cancel`);
}

// The status shown in the list row behind the panel (outside the
// accessibility tree while the modal is open, so read from the DOM).
function listStatus(): string | null | undefined {
  return document.querySelector('table.table tbody tr .badge')?.textContent;
}

async function openForm(dialog: Panel) {
  await userEvent.click(
    await dialog.findByRole('button', { name: 'Cancel order' }),
  );
  return within(dialog.getByRole('form', { name: 'Cancel this order' }));
}

it.each<OrderStatus>(['ordered', 'collected'])(
  'offers Cancel order on a %s order',
  async (status) => {
    fakeApi(status);
    renderApp(`/?order=${ID}`);
    const dialog = await panel();
    expect(
      await dialog.findByRole('button', { name: 'Cancel order' }),
    ).toBeTruthy();
    expect(dialog.queryByRole('form')).toBeNull();
  },
);

it.each<OrderStatus>(['completed', 'cancelled'])(
  'offers no Cancel order and no form on a %s order',
  async (status) => {
    fakeApi(status);
    renderApp(`/?order=${ID}`);
    const dialog = await panel();
    await dialog.findByText('Total $25.00');
    expect(buttons(dialog)).toEqual(['Close']);
    expect(dialog.queryByRole('form')).toBeNull();
  },
);

it('opens the form inside the panel, not in a second dialog', async () => {
  fakeApi('ordered');
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  const form = await openForm(dialog);

  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(form.getByLabelText('Note')).toBeTruthy();
  expect(form.getByLabelText('Your name')).toBeTruthy();
  expect(form.getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Confirm cancel',
    'Keep order',
  ]);
  // The action that opened it is gone while the form is open.
  expect(dialog.queryByRole('button', { name: 'Cancel order' })).toBeNull();
  expect(document.activeElement).toBe(form.getByLabelText('Note'));
});

it('blocks an empty note and an empty name with a message under each', async () => {
  const { fetch } = fakeApi('ordered');
  renderApp(`/?order=${ID}`);
  const form = await openForm(await panel());
  await userEvent.type(form.getByLabelText('Your name'), '   ');

  await userEvent.click(form.getByRole('button', { name: 'Confirm cancel' }));

  const note = form.getByLabelText('Note');
  const name = form.getByLabelText('Your name');
  expect(note.getAttribute('aria-invalid')).toBe('true');
  expect(name.getAttribute('aria-invalid')).toBe('true');
  expect(
    document.getElementById(note.getAttribute('aria-describedby')!)
      ?.textContent,
  ).toBe('Note is required');
  expect(
    document.getElementById(name.getAttribute('aria-describedby')!)
      ?.textContent,
  ).toBe('Your name is required');
  expect(cancelPosts(fetch)).toHaveLength(0);
});

it('blocks a note over 500 characters before sending', async () => {
  const { fetch } = fakeApi('ordered');
  renderApp(`/?order=${ID}`);
  const form = await openForm(await panel());
  await userEvent.click(form.getByLabelText('Note'));
  await userEvent.paste('n'.repeat(501));
  await userEvent.type(form.getByLabelText('Your name'), 'Sample Staff');

  await userEvent.click(form.getByRole('button', { name: 'Confirm cancel' }));

  expect(
    await form.findByText('Note must be 500 characters or fewer'),
  ).toBeTruthy();
  expect(cancelPosts(fetch)).toHaveLength(0);
});

it('Keep order closes the form and sends nothing', async () => {
  const { fetch } = fakeApi('collected');
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  const form = await openForm(dialog);

  await userEvent.click(form.getByRole('button', { name: 'Keep order' }));

  expect(dialog.queryByRole('form')).toBeNull();
  expect(buttons(dialog)).toEqual(['Mark completed', 'Cancel order', 'Close']);
  expect(cancelPosts(fetch)).toHaveLength(0);
});

it('cancels, then shows who, when and why, and refreshes the list', async () => {
  const { fetch } = fakeApi('collected');
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  await waitFor(() => expect(listStatus()).toBe('Collected'));
  const listReads = () =>
    fetch.mock.calls.filter(([url]) => url === '/api/orders').length;
  const listReadsBefore = listReads();
  const form = await openForm(dialog);
  await userEvent.type(form.getByLabelText('Note'), '  Duplicate order ');
  await userEvent.type(form.getByLabelText('Your name'), ' Sample Staff');

  await userEvent.click(form.getByRole('button', { name: 'Confirm cancel' }));

  // The trimmed values were sent.
  expect(cancelPosts(fetch)).toEqual([
    [
      `/api/orders/${ID}/cancel`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          note: 'Duplicate order',
          cancelledBy: 'Sample Staff',
        }),
      }),
    ],
  ]);
  expect(
    await dialog.findByText(
      'Cancelled by Sample Staff on Nov 12, 2026, 10:05 am: Duplicate order',
    ),
  ).toBeTruthy();
  expect(dialog.getByText('Cancelled')).toBeTruthy();
  // No status buttons, no cancel action, no form.
  expect(buttons(dialog)).toEqual(['Close']);
  expect(dialog.queryByRole('form')).toBeNull();
  // The list behind the panel refreshed by invalidation (fetched again).
  await waitFor(() => expect(listStatus()).toBe('Cancelled'));
  expect(listReads()).toBeGreaterThan(listReadsBefore);
});

it('shows a cancelled order with who, when and why and no status buttons', async () => {
  fakeApi('cancelled');
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  expect(
    await dialog.findByText(
      'Cancelled by Sample Staff on Nov 12, 2026, 10:05 am: Patient asked to reschedule',
    ),
  ).toBeTruthy();
  expect(buttons(dialog)).toEqual(['Close']);
});

it('disables Confirm cancel while the request is in flight', async () => {
  let answer: (response: Response) => void = () => {};
  const { state } = fakeApi(
    'ordered',
    () => new Promise((resolve) => (answer = resolve)),
  );
  renderApp(`/?order=${ID}`);
  const form = await openForm(await panel());
  await userEvent.type(form.getByLabelText('Note'), 'Duplicate order');
  await userEvent.type(form.getByLabelText('Your name'), 'Sample Staff');
  const confirm = form.getByRole('button', { name: 'Confirm cancel' });

  await userEvent.click(confirm);

  expect(confirm).toHaveProperty('disabled', true);
  state.status = 'cancelled';
  state.cancellation = CANCELLATION;
  answer(json(200, detail(state)));
  expect(await screen.findByText(/^Cancelled by Sample Staff/)).toBeTruthy();
});

it('disables the status buttons while a cancel is in flight', async () => {
  let answer: (response: Response) => void = () => {};
  const { state } = fakeApi(
    'collected',
    () => new Promise((resolve) => (answer = resolve)),
  );
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  const form = await openForm(dialog);
  await userEvent.type(form.getByLabelText('Note'), 'Duplicate order');
  await userEvent.type(form.getByLabelText('Your name'), 'Sample Staff');

  await userEvent.click(form.getByRole('button', { name: 'Confirm cancel' }));

  expect(dialog.getByRole('button', { name: 'Mark completed' })).toHaveProperty(
    'disabled',
    true,
  );
  state.status = 'cancelled';
  state.cancellation = CANCELLATION;
  answer(json(200, detail(state)));
  expect(await screen.findByText(/^Cancelled by Sample Staff/)).toBeTruthy();
});

it('Keep order after a refused cancel clears the old message', async () => {
  // The server refuses, and the order stays collected, so the form stays.
  fakeApi('collected', () =>
    json(409, {
      error: {
        code: 'ORDER_CHANGED',
        message: 'This order was changed by someone else',
        requestId: 'req-409',
      },
    }),
  );
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  const form = await openForm(dialog);
  await userEvent.type(form.getByLabelText('Note'), 'Duplicate order');
  await userEvent.type(form.getByLabelText('Your name'), 'Sample Staff');
  await userEvent.click(form.getByRole('button', { name: 'Confirm cancel' }));
  await dialog.findByRole('alert');

  await userEvent.click(form.getByRole('button', { name: 'Keep order' }));

  expect(dialog.queryByRole('alert')).toBeNull();
});

it.each([
  {
    status: 409,
    code: 'ORDER_CHANGED',
    message: 'This order was changed by someone else',
  },
  {
    status: 422,
    code: 'ILLEGAL_TRANSITION',
    message: 'An order cannot move from completed to cancelled',
  },
])(
  'on $status explains it and reloads the real state',
  async ({ status, code, message }) => {
    // Someone else completed the order after this panel loaded it.
    const { fetch } = fakeApi('collected', (state) => {
      state.status = 'completed';
      return json(status, {
        error: { code, message, requestId: `req-${status}` },
      });
    });
    renderApp(`/?order=${ID}`);
    const dialog = await panel();
    const form = await openForm(dialog);
    await userEvent.type(form.getByLabelText('Note'), 'Duplicate order');
    await userEvent.type(form.getByLabelText('Your name'), 'Sample Staff');

    await userEvent.click(form.getByRole('button', { name: 'Confirm cancel' }));

    expect((await dialog.findByRole('alert')).textContent).toBe(
      `${message}. Reference: req-${status}`,
    );
    // Reloaded: completed, so no cancel action and no form any more.
    expect(await dialog.findByText('Completed')).toBeTruthy();
    expect(dialog.queryByRole('form')).toBeNull();
    expect(buttons(dialog)).toEqual(['Close']);
    expect(
      fetch.mock.calls.filter(([url]) => url === `/api/orders/${ID}`).length,
    ).toBe(2);
    await waitFor(() => expect(listStatus()).toBe('Completed'));
  },
);
