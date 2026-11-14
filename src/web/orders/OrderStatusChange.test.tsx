// Moving an order's status from the panel (LAB-16): one button per allowed
// move, the button disabled in flight, the new status in the panel and in
// the list behind it, and the 409 and 422 answers.
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

// The moves the real table allows (the server decides; this fake repeats it
// only to answer like the server would).
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  ordered: ['collected'],
  collected: ['completed'],
  completed: [],
  cancelled: [],
};

function detail(status: OrderStatus): OrderDetail {
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
  };
}

function list(status: OrderStatus): OrderList {
  const order = detail(status);
  return {
    items: [
      {
        id: ID,
        status,
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

// A fake API holding one order's status. `onMove` answers the POST; by
// default it moves the order and returns it, as the server does.
function fakeApi(
  start: OrderStatus,
  onMove?: (
    to: OrderStatus,
    state: { status: OrderStatus },
  ) => Response | Promise<Response>,
) {
  const state = { status: start };
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/healthz') return Promise.resolve(json(200, { status: 'ok' }));
    if (url === '/api/orders') {
      return Promise.resolve(json(200, list(state.status)));
    }
    if (url === `/api/orders/${ID}`) {
      return Promise.resolve(json(200, detail(state.status)));
    }
    if (url === `/api/orders/${ID}/transitions` && init?.method === 'POST') {
      const { to } = JSON.parse(init.body as string) as { to: OrderStatus };
      if (onMove) return Promise.resolve(onMove(to, state));
      state.status = to;
      return Promise.resolve(json(200, detail(to)));
    }
    return Promise.resolve(json(500, {}));
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, state };
}

const panel = async () =>
  within(await screen.findByRole('dialog', { name: 'Order' }));

// The buttons in the panel, by their text.
function buttons(dialog: Awaited<ReturnType<typeof panel>>): string[] {
  return dialog.getAllByRole('button').map((b) => b.textContent);
}

// The status shown in the list row behind the panel. The panel is a modal
// dialog, so the row is outside the accessibility tree: read it from the DOM.
function listStatus(): string | null | undefined {
  return document.querySelector('table.table tbody tr .badge')?.textContent;
}

it('offers only Mark collected for an ordered order, then only Mark completed', async () => {
  const { fetch } = fakeApi('ordered');
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  await dialog.findByText('Ordered');
  expect(buttons(dialog)).toEqual(['Mark collected', 'Close']);
  await waitFor(() => expect(listStatus()).toBe('Ordered'));

  await userEvent.click(dialog.getByRole('button', { name: 'Mark collected' }));

  expect(await dialog.findByText('Collected')).toBeTruthy();
  expect(buttons(dialog)).toEqual(['Mark completed', 'Close']);
  expect(fetch).toHaveBeenCalledWith(
    `/api/orders/${ID}/transitions`,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ to: 'collected' }),
    }),
  );
  // The list behind the panel refreshed, with no reload.
  await waitFor(() => expect(listStatus()).toBe('Collected'));
  // Focus stays inside the panel, on the new status.
  expect(document.activeElement?.textContent).toBe('Collected');
});

it('shows completed and no status buttons after Mark completed', async () => {
  fakeApi('collected');
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  await userEvent.click(
    await dialog.findByRole('button', { name: 'Mark completed' }),
  );
  expect(await dialog.findByText('Completed')).toBeTruthy();
  expect(buttons(dialog)).toEqual(['Close']);
  await waitFor(() => expect(listStatus()).toBe('Completed'));
});

it.each<OrderStatus>(['completed', 'cancelled'])(
  'shows no status buttons for a %s order',
  async (status) => {
    fakeApi(status);
    renderApp(`/?order=${ID}`);
    const dialog = await panel();
    await dialog.findByText('Total $25.00');
    expect(buttons(dialog)).toEqual(['Close']);
  },
);

it('disables the button while the request is in flight', async () => {
  // The POST waits until the test answers it.
  let answer: (response: Response) => void = () => {};
  const { state } = fakeApi(
    'ordered',
    () => new Promise((resolve) => (answer = resolve)),
  );
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  const button = await dialog.findByRole('button', { name: 'Mark collected' });

  await userEvent.click(button);

  expect(button).toHaveProperty('disabled', true);
  state.status = 'collected';
  answer(json(200, detail('collected')));
  expect(await dialog.findByText('Collected')).toBeTruthy();
  expect(dialog.getByRole('button', { name: 'Mark completed' })).toHaveProperty(
    'disabled',
    false,
  );
});

it('on 409 says the order changed and reloads it to show its real status', async () => {
  // Someone else marked it collected after this panel loaded it as ordered.
  const { fetch } = fakeApi('ordered', (_to, state) => {
    state.status = 'collected';
    return json(409, {
      error: {
        code: 'ORDER_CHANGED',
        message: 'This order was changed by someone else',
        requestId: 'req-409',
      },
    });
  });
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  await userEvent.click(
    await dialog.findByRole('button', { name: 'Mark collected' }),
  );

  expect((await dialog.findByRole('alert')).textContent).toBe(
    'This order was changed by someone else. Reference: req-409',
  );
  // Reloaded: the real status and the move allowed from it.
  expect(await dialog.findByText('Collected')).toBeTruthy();
  expect(buttons(dialog)).toEqual(['Mark completed', 'Close']);
  const orderReads = fetch.mock.calls.filter(
    ([url]) => url === `/api/orders/${ID}`,
  );
  expect(orderReads.length).toBe(2);
  await waitFor(() => expect(listStatus()).toBe('Collected'));
});

it("on 422 shows the server's message and reloads the order", async () => {
  // Another tab marked it collected after this panel loaded it as ordered:
  // the server reads collected, and the table refuses collected to collected.
  const { fetch } = fakeApi('ordered', (_to, state) => {
    state.status = 'collected';
    return json(422, {
      error: {
        code: 'ILLEGAL_TRANSITION',
        message: 'An order cannot move from collected to collected',
        requestId: 'req-422',
      },
    });
  });
  renderApp(`/?order=${ID}`);
  const dialog = await panel();
  await userEvent.click(
    await dialog.findByRole('button', { name: 'Mark collected' }),
  );

  expect((await dialog.findByRole('alert')).textContent).toBe(
    'An order cannot move from collected to collected. Reference: req-422',
  );
  // Reloaded: the real status and the move allowed from it.
  expect(await dialog.findByText('Collected')).toBeTruthy();
  expect(buttons(dialog)).toEqual(['Mark completed', 'Close']);
  expect(
    fetch.mock.calls.filter(([url]) => url === `/api/orders/${ID}`),
  ).toHaveLength(2);
});
