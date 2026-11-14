// The live total and ready date in the New order modal, with a fake API.
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { SEEDED } from '../testing/fake-patients-api';
import { renderApp } from '../testing/render';

const id = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CATALOG = [
  { n: 1, code: 'CBC', name: 'Complete Blood Count' },
  { n: 2, code: 'LIPID', name: 'Lipid Panel' },
].map(({ n, code, name }) => ({
  id: id(n),
  code,
  name,
  priceCents: 1000 * n,
  turnaroundDays: n,
  isActive: true,
}));
const PATIENT = { ...SEEDED[0]!, id: '20000000-0000-4000-8000-000000000001' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type Quote = (ids: string[]) => Promise<Response>;
const quoteFor = (ids: string[]) => {
  const tests = CATALOG.filter((test) => ids.includes(test.id));
  return {
    items: tests.map((test) => ({
      labTestId: test.id,
      testCode: test.code,
      testName: test.name,
      priceCents: test.priceCents,
      turnaroundDays: test.turnaroundDays,
    })),
    totalCents: tests.reduce((sum, test) => sum + test.priceCents, 0),
    estimatedReadyDate: ids.length > 1 ? '2026-11-17' : '2026-11-16',
  };
};

function fakeApi(quote: Quote) {
  const quotes: string[][] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const { pathname, searchParams } = new URL(url, 'http://localhost');
      if (pathname === '/healthz') return json(200, { status: 'ok' });
      if (pathname === '/api/lab-tests') return json(200, CATALOG);
      if (pathname === '/api/patients') {
        const q = (searchParams.get('q') ?? '').toLowerCase();
        return json(
          200,
          [PATIENT].filter((p) => `${p.firstName}`.toLowerCase().includes(q)),
        );
      }
      if (pathname === '/api/orders/quote') {
        const body = JSON.parse(init?.body as string) as {
          labTestIds: string[];
        };
        const ids = body.labTestIds;
        quotes.push(ids);
        return quote(ids);
      }
      if (pathname === '/api/orders') {
        return json(200, { items: [], hasMore: false, clinicTimezone: 'UTC' });
      }
      return json(404, {});
    }),
  );
  return quotes;
}

// The summary's lines; the same price also sits in the chosen-tests table.
const total = () => screen.getByText(/^Total:/).textContent;
const ready = () => screen.getByText(/^Estimated ready date:/).textContent;

async function open() {
  const user = userEvent.setup();
  renderApp('/');
  await user.click(
    await screen.findByRole('button', { name: 'Place new order' }),
  );
  await user.type(screen.getByLabelText('Patient'), 'demo');
  await user.click(await screen.findByRole('button', { name: /Demo Example/ }));
  return user;
}

const add = (user: ReturnType<typeof userEvent.setup>, code: string) =>
  user.type(
    screen.getByRole('combobox', { name: 'Add a test' }),
    `${code}{ArrowDown}{Enter}`,
  );

it('shows the placeholder and sends no request with no tests chosen', async () => {
  const quotes = fakeApi((ids) => Promise.resolve(json(200, quoteFor(ids))));
  await open();
  expect(screen.getByText('Add a test to see the total')).toBeTruthy();
  expect(quotes).toEqual([]);
});

it('shows the server’s total and ready date, and updates them when a test is added', async () => {
  const quotes = fakeApi((ids) => Promise.resolve(json(200, quoteFor(ids))));
  const user = await open();
  await add(user, 'cbc');
  await waitFor(() => expect(total()).toBe('Total: $10.00'));
  expect(ready()).toContain('Nov 16, 2026');
  await add(user, 'lipid');
  await waitFor(() => expect(total()).toBe('Total: $30.00'));
  expect(ready()).toContain('Nov 17, 2026');
  // One request per change of the chosen tests, none for the typing.
  expect(quotes).toHaveLength(2);
});

it('keeps the old numbers while a new quote loads, marked as updating', async () => {
  let release: () => void = () => {};
  const quotes = fakeApi((ids) =>
    ids.length === 1
      ? Promise.resolve(json(200, quoteFor(ids)))
      : new Promise((resolve) => {
          release = () => resolve(json(200, quoteFor(ids)));
        }),
  );
  const user = await open();
  await add(user, 'cbc');
  await waitFor(() => expect(total()).toBe('Total: $10.00'));
  await add(user, 'lipid');
  await screen.findByText('Updating…');
  expect(total()).toBe('Total: $10.00');
  expect(quotes).toHaveLength(2);
  release();
  await waitFor(() => expect(total()).toBe('Total: $30.00'));
  expect(screen.queryByText('Updating…')).toBeNull();
});

it('shows the request id when the quote fails and leaves Submit order enabled', async () => {
  fakeApi(() =>
    Promise.resolve(
      json(500, {
        error: { code: 'INTERNAL', message: 'x', requestId: 'req-quote-1' },
      }),
    ),
  );
  const user = await open();
  await add(user, 'cbc');
  await waitFor(() =>
    expect(screen.getByText(/Reference: req-quote-1/)).toBeTruthy(),
  );
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Submit order' })
      .disabled,
  ).toBe(false);
});
