import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LAB_TEST_MESSAGES, type LabTest } from '../../shared/lab-tests';
import { renderApp } from '../testing/render';
import { PRICE_MESSAGE } from './AddLabTestForm';

function labTest(code: string, fields: Partial<LabTest> = {}): LabTest {
  return {
    id: `10000000-0000-4000-8000-${String(code.length).padStart(12, '0')}`,
    code,
    name: `Test ${code}`,
    priceCents: 1000,
    turnaroundDays: 1,
    isActive: true,
    ...fields,
  };
}

type Reply = { status: number; body?: unknown };

// Matches an input's accessible description (its help text, then its error)
// when it ends with the error `message`.
function endsWith(message: string) {
  return (description: string) => description.endsWith(message);
}

// A fake API: the list is `list` (or `listReply`), and each POST gets
// `onPost(body)`. Returns the mock so a test can look at the requests.
function fakeApi({
  list = [],
  listReply,
  onPost = () => ({ status: 500 }),
}: {
  list?: LabTest[];
  listReply?: () => Promise<Reply>;
  onPost?: (body: Record<string, unknown>) => Reply;
}) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    let reply: Reply;
    if (url === '/healthz') reply = { status: 200, body: { status: 'ok' } };
    else if (init?.method === 'POST') {
      reply = onPost(
        JSON.parse(init.body as string) as Record<string, unknown>,
      );
    } else reply = listReply ? await listReply() : { status: 200, body: list };
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

// The bodies of the POST requests sent, parsed.
function posts(fetch: ReturnType<typeof fakeApi>): unknown[] {
  return fetch.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => JSON.parse(init?.body as string) as unknown);
}

async function fillForm(values: {
  code?: string;
  name?: string;
  price?: string;
  turnaround?: string;
}) {
  const fields: [string, string | undefined][] = [
    ['Code', values.code],
    ['Name', values.name],
    ['Price (dollars)', values.price],
    ['Turnaround (business days)', values.turnaround],
  ];
  for (const [label, text] of fields) {
    const input = screen.getByLabelText(label);
    await userEvent.clear(input);
    if (text) await userEvent.type(input, text);
  }
  await userEvent.click(screen.getByRole('button', { name: 'Add lab test' }));
}

function rowTexts(): string[][] {
  const [, ...rows] = screen.getAllByRole('row');
  return rows.map((row) =>
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent ?? ''),
  );
}

describe('the lab test list', () => {
  it('shows each test with its price in dollars, turnaround and active flag', async () => {
    fakeApi({
      list: [
        labTest('A1C', {
          priceCents: 1250,
          turnaroundDays: 3,
          isActive: false,
        }),
        labTest('CBC', { priceCents: 0, turnaroundDays: 1 }),
      ],
    });
    renderApp('/catalog');

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(
      screen.getAllByRole('columnheader').map((th) => th.textContent),
    ).toEqual(['Code', 'Name', 'Price', 'Turnaround', 'Active']);
    expect(rowTexts()).toEqual([
      ['A1C', 'Test A1C', '$12.50', '3 business days', 'No'],
      ['CBC', 'Test CBC', '$0.00', '1 business day', 'Yes'],
    ]);
  });

  it('shows the loading state while the list loads', async () => {
    fakeApi({ listReply: () => new Promise(() => {}) });
    renderApp('/catalog');
    const loading = await screen.findByText('Loading lab tests…');
    expect(loading.getAttribute('role')).toBe('status');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the empty state when there are no tests', async () => {
    fakeApi({ list: [] });
    renderApp('/catalog');
    expect(
      await screen.findByText('No lab tests yet. Add the first one below.'),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows a server error with its request id instead of a table, and retries', async () => {
    let failing = true;
    fakeApi({
      listReply: () =>
        Promise.resolve(
          failing
            ? {
                status: 500,
                body: {
                  error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Something went wrong on our side',
                    requestId: 'req-500',
                  },
                },
              }
            : { status: 200, body: [labTest('CBC')] },
        ),
    });
    renderApp('/catalog');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Something went wrong on the server. Try again. Reference: req-500',
    );
    expect(screen.queryByRole('table')).toBeNull();

    failing = false;
    await userEvent.click(
      within(alert).getByRole('button', { name: 'Try again' }),
    );
    expect(await screen.findByRole('table')).toBeTruthy();
  });
});

describe('the add form', () => {
  it('sends cents and an upper-case code, clears, and shows the new test without a reload', async () => {
    const list: LabTest[] = [labTest('CBC')];
    const fetch = fakeApi({
      list,
      onPost: (body) => {
        const created = labTest(String(body.code), {
          id: '10000000-0000-4000-8000-000000000099',
          name: String(body.name),
          priceCents: Number(body.priceCents),
          turnaroundDays: Number(body.turnaroundDays),
        });
        list.push(created);
        return { status: 201, body: created };
      },
    });
    renderApp('/catalog');
    await screen.findByRole('table');

    await fillForm({
      code: 'demo-09',
      name: 'Demo Panel',
      price: '19.99',
      turnaround: '2',
    });

    await waitFor(() => {
      expect(rowTexts()).toContainEqual([
        'DEMO-09',
        'Demo Panel',
        '$19.99',
        '2 business days',
        'Yes',
      ]);
    });
    expect(posts(fetch)).toEqual([
      {
        code: 'DEMO-09',
        name: 'Demo Panel',
        priceCents: 1999,
        turnaroundDays: 2,
      },
    ]);
    expect(screen.getByLabelText<HTMLInputElement>('Code').value).toBe('');
    expect(
      screen.getByLabelText<HTMLInputElement>('Price (dollars)').value,
    ).toBe('');
  });

  it('Clear empties the fields and removes the messages', async () => {
    const fetch = fakeApi({});
    renderApp('/catalog');

    await fillForm({ code: 'AB', name: '', price: 'abc', turnaround: '1' });
    expect(document.querySelectorAll('.field-error')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(document.querySelectorAll('.field-error')).toHaveLength(0);
    expect(screen.getByLabelText<HTMLInputElement>('Code').value).toBe('');
    expect(
      screen.getByLabelText<HTMLInputElement>('Price (dollars)').value,
    ).toBe('');
    expect(posts(fetch)).toHaveLength(0);
  });

  it('accepts a price of 0', async () => {
    const fetch = fakeApi({
      onPost: () => ({ status: 201, body: labTest('FREE', { priceCents: 0 }) }),
    });
    renderApp('/catalog');

    await fillForm({
      code: 'FREE',
      name: 'Free test',
      price: '0',
      turnaround: '1',
    });

    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(posts(fetch)[0]).toMatchObject({
      priceCents: 0,
    });
  });

  it('shows "This code already exists" under the code field for a 409', async () => {
    fakeApi({
      list: [labTest('CBC')],
      onPost: () => ({
        status: 409,
        body: {
          error: {
            code: 'DUPLICATE_TEST_CODE',
            message: 'This code already exists',
            requestId: 'req-409',
          },
        },
      }),
    });
    renderApp('/catalog');

    await fillForm({
      code: 'cbc',
      name: 'Again',
      price: '10',
      turnaround: '1',
    });

    expect(
      await screen.findByRole('textbox', {
        name: 'Code',
        description: endsWith('This code already exists'),
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the field details of a 400 under their fields', async () => {
    fakeApi({
      onPost: () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'The request is not valid',
            details: [{ field: 'name', reason: 'Server says no' }],
            requestId: 'req-400',
          },
        },
      }),
    });
    renderApp('/catalog');

    await fillForm({ code: 'AB', name: 'Fine', price: '1', turnaround: '1' });

    expect(
      await screen.findByRole('textbox', {
        name: 'Name',
        description: endsWith('Server says no'),
      }),
    ).toBeTruthy();
  });

  it('shows any other failure with its request id above the button', async () => {
    fakeApi({
      onPost: () => ({
        status: 500,
        body: {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong on our side',
            requestId: 'req-post-500',
          },
        },
      }),
    });
    renderApp('/catalog');

    await fillForm({ code: 'AB', name: 'Fine', price: '1', turnaround: '1' });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Reference: req-post-500',
    );
  });

  const valid = {
    code: 'DEMO-09',
    name: 'Demo Panel',
    price: '19.99',
    turnaround: '2',
  };
  it.each([
    {
      what: 'a blank name',
      change: { name: '' },
      field: 'Name',
      message: LAB_TEST_MESSAGES.name,
    },
    {
      what: 'a price of -1',
      change: { price: '-1' },
      field: 'Price (dollars)',
      message: PRICE_MESSAGE,
    },
    {
      what: 'a price of 12.345',
      change: { price: '12.345' },
      field: 'Price (dollars)',
      message: PRICE_MESSAGE,
    },
    {
      what: 'a price of abc',
      change: { price: 'abc' },
      field: 'Price (dollars)',
      message: PRICE_MESSAGE,
    },
    {
      what: 'a turnaround of 0',
      change: { turnaround: '0' },
      field: 'Turnaround (business days)',
      message: LAB_TEST_MESSAGES.turnaroundDays,
    },
    {
      what: 'a turnaround of 1.5',
      change: { turnaround: '1.5' },
      field: 'Turnaround (business days)',
      message: LAB_TEST_MESSAGES.turnaroundDays,
    },
    {
      what: 'a one-letter code',
      change: { code: 'A' },
      field: 'Code',
      message: LAB_TEST_MESSAGES.code,
    },
  ])(
    'shows a message under the field and sends nothing for $what',
    async ({ change, field, message }) => {
      const fetch = fakeApi({});
      renderApp('/catalog');

      await fillForm({ ...valid, ...change });

      expect(
        screen.getByRole('textbox', {
          name: field,
          description: endsWith(message),
        }),
      ).toBeTruthy();
      // Only the one field is marked wrong.
      expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(
        1,
      );
      expect(posts(fetch)).toHaveLength(0);
    },
  );
});
