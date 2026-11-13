import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LAB_TEST_MESSAGES, type LabTest } from '../../shared/lab-tests';
import { renderApp } from '../testing/render';
import { CODE_LOCKED_HELP, PRICE_MESSAGE } from './LabTestForm';

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

// A fake API: the list is `list` (or `listReply`), each POST gets
// `onPost(body)` and each PATCH `onPatch(id, body)`. Returns the mock so a
// test can look at the requests.
function fakeApi({
  list = [],
  listReply,
  onPost = () => ({ status: 500 }),
  onPatch = () => ({ status: 500 }),
}: {
  list?: LabTest[];
  listReply?: () => Promise<Reply>;
  onPost?: (body: Record<string, unknown>) => Reply;
  onPatch?: (
    id: string,
    body: Record<string, unknown>,
  ) => Reply | Promise<Reply>;
}) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    let reply: Reply;
    if (url === '/healthz') reply = { status: 200, body: { status: 'ok' } };
    else if (init?.method === 'POST') {
      reply = onPost(
        JSON.parse(init.body as string) as Record<string, unknown>,
      );
    } else if (init?.method === 'PATCH') {
      reply = await onPatch(
        url.replace('/api/lab-tests/', ''),
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

// Each row's cells, without the last one (the Edit and Activate buttons).
function rowTexts(): string[][] {
  const [, ...rows] = screen.getAllByRole('row');
  return rows.map((row) =>
    within(row)
      .getAllByRole('cell')
      .slice(0, -1)
      .map((cell) => cell.textContent ?? ''),
  );
}

describe('the lab test list', () => {
  it('shows each test with its price in dollars, turnaround and status', async () => {
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
    ).toEqual(['Code', 'Name', 'Price', 'Turnaround', 'Status', 'Actions']);
    expect(rowTexts()).toEqual([
      ['A1C', 'Test A1C', '$12.50', '3 business days', 'Inactive'],
      ['CBC', 'Test CBC', '$0.00', '1 business day', 'Active'],
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
        'Active',
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

// A fake PATCH that changes the matching test in `list`, as the server would.
function patchInto(list: LabTest[]) {
  return (id: string, body: Record<string, unknown>): Reply => {
    const index = list.findIndex((test) => test.id === id);
    const updated = { ...list[index], ...body } as LabTest;
    list[index] = updated;
    return { status: 200, body: updated };
  };
}

// The PATCH requests sent: the id in the path and the parsed body.
function patches(fetch: ReturnType<typeof fakeApi>): [string, unknown][] {
  return fetch.mock.calls
    .filter(([, init]) => init?.method === 'PATCH')
    .map(([url, init]) => [url, JSON.parse(init?.body as string) as unknown]);
}

function listRequests(fetch: ReturnType<typeof fakeApi>): number {
  return fetch.mock.calls.filter(
    ([url, init]) =>
      url === '/api/lab-tests' && (init?.method ?? 'GET') === 'GET',
  ).length;
}

const notFound: Reply = {
  status: 404,
  body: {
    error: {
      code: 'NOT_FOUND',
      message: 'There is no lab test with this id',
      requestId: 'req-404',
    },
  },
};

const CBC = labTest('CBC', {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Complete Blood Count',
  priceCents: 1000,
  turnaroundDays: 1,
});
const TSH = labTest('TSH', {
  id: '10000000-0000-4000-8000-000000000002',
  name: 'Thyroid Stimulating Hormone',
});

async function startEditing(code: string) {
  await userEvent.click(
    await screen.findByRole('button', { name: `Edit ${code}` }),
  );
}

describe('the edit form', () => {
  it('fills in the row, shows the code locked, and cannot be typed into', async () => {
    fakeApi({ list: [{ ...CBC, priceCents: 1250 }, TSH] });
    renderApp('/catalog');

    await startEditing('CBC');

    expect(screen.getByRole('heading', { name: 'Edit CBC' })).toBeTruthy();
    const code = screen.getByRole('textbox', {
      name: 'Code',
      description: CODE_LOCKED_HELP,
    });
    expect((code as HTMLInputElement).disabled).toBe(true);
    await userEvent.type(code, 'XYZ');
    expect((code as HTMLInputElement).value).toBe('CBC');
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe(
      'Complete Blood Count',
    );
    expect(
      screen.getByLabelText<HTMLInputElement>('Price (dollars)').value,
    ).toBe('12.50');
    expect(
      screen.getByLabelText<HTMLInputElement>('Turnaround (business days)')
        .value,
    ).toBe('1');
  });

  it('saves a new name, sending only the name, and shows it with the code kept', async () => {
    const list = [CBC, TSH];
    const fetch = fakeApi({ list, onPatch: patchInto(list) });
    renderApp('/catalog');

    await startEditing('CBC');
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Full Blood Count');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(rowTexts()[0]).toEqual([
        'CBC',
        'Full Blood Count',
        '$10.00',
        '1 business day',
        'Active',
      ]);
    });
    expect(patches(fetch)).toEqual([
      [`/api/lab-tests/${CBC.id}`, { name: 'Full Blood Count' }],
    ]);
    // Back to adding.
    expect(
      screen.getByRole('heading', { name: 'Add a lab test' }),
    ).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Code').disabled).toBe(
      false,
    );
  });

  it('sends a price of 25.00 as 2500 cents and shows $25.00', async () => {
    const list = [CBC];
    const fetch = fakeApi({ list, onPatch: patchInto(list) });
    renderApp('/catalog');

    await startEditing('CBC');
    const price = screen.getByLabelText('Price (dollars)');
    await userEvent.clear(price);
    await userEvent.type(price, '25.00');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(rowTexts()[0]?.[2]).toBe('$25.00'));
    expect(patches(fetch)).toEqual([
      [`/api/lab-tests/${CBC.id}`, { priceCents: 2500 }],
    ]);
  });

  it('Cancel drops the changes and sends nothing', async () => {
    const fetch = fakeApi({ list: [CBC] });
    renderApp('/catalog');

    await startEditing('CBC');
    await userEvent.type(screen.getByLabelText('Name'), ' changed');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(patches(fetch)).toEqual([]);
    expect(
      screen.getByRole('heading', { name: 'Add a lab test' }),
    ).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('');
    expect(rowTexts()[0]?.[1]).toBe('Complete Blood Count');
  });

  it('closes without a request when nothing changed', async () => {
    const fetch = fakeApi({ list: [CBC] });
    renderApp('/catalog');

    await startEditing('CBC');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(patches(fetch)).toEqual([]);
    expect(
      screen.getByRole('heading', { name: 'Add a lab test' }),
    ).toBeTruthy();
  });

  it('shows a field error and sends nothing for a turnaround of 0', async () => {
    const fetch = fakeApi({ list: [CBC] });
    renderApp('/catalog');

    await startEditing('CBC');
    const turnaround = screen.getByLabelText('Turnaround (business days)');
    await userEvent.clear(turnaround);
    await userEvent.type(turnaround, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      screen.getByRole('textbox', {
        name: 'Turnaround (business days)',
        description: endsWith(LAB_TEST_MESSAGES.turnaroundDays),
      }),
    ).toBeTruthy();
    expect(patches(fetch)).toEqual([]);
  });

  it('shows the message and fetches the list again when the test is gone (404)', async () => {
    const fetch = fakeApi({ list: [CBC], onPatch: () => notFound });
    renderApp('/catalog');

    await startEditing('CBC');
    await userEvent.type(screen.getByLabelText('Name'), ' changed');
    const before = listRequests(fetch);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'There is no lab test with this id. Reference: req-404',
    );
    await waitFor(() => expect(listRequests(fetch)).toBe(before + 1));
  });
});

describe('Activate and Deactivate', () => {
  it('deactivates TSH at once, marks the row Inactive, and activates it again', async () => {
    const list = [CBC, TSH];
    const fetch = fakeApi({ list, onPatch: patchInto(list) });
    renderApp('/catalog');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Deactivate TSH' }),
    );

    const activate = await screen.findByRole('button', {
      name: 'Activate TSH',
    });
    const row = activate.closest('tr') as HTMLElement;
    expect(within(row).getByText('Inactive')).toBeTruthy();
    expect(row.className).toBe('muted');
    expect(rowTexts()[0]?.[4]).toBe('Active');

    await userEvent.click(activate);

    await screen.findByRole('button', { name: 'Deactivate TSH' });
    expect(rowTexts()[1]?.[4]).toBe('Active');
    expect(patches(fetch)).toEqual([
      [`/api/lab-tests/${TSH.id}`, { isActive: false }],
      [`/api/lab-tests/${TSH.id}`, { isActive: true }],
    ]);
  });

  it('disables only that row button while its request runs', async () => {
    let answer: (reply: Reply) => void = () => {};
    fakeApi({
      list: [CBC, TSH],
      onPatch: () => new Promise<Reply>((resolve) => (answer = resolve)),
    });
    renderApp('/catalog');

    const button = await screen.findByRole('button', {
      name: 'Deactivate TSH',
    });
    await userEvent.click(button);

    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(true),
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Deactivate CBC' })
        .disabled,
    ).toBe(false);

    answer({ status: 200, body: { ...TSH, isActive: false } });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('shows the message and fetches the list again when the test is gone (404)', async () => {
    const fetch = fakeApi({ list: [TSH], onPatch: () => notFound });
    renderApp('/catalog');

    const button = await screen.findByRole('button', {
      name: 'Deactivate TSH',
    });
    const before = listRequests(fetch);
    await userEvent.click(button);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'There is no lab test with this id',
    );
    await waitFor(() => expect(listRequests(fetch)).toBe(before + 1));
  });

  it('offers no way to delete a test', async () => {
    fakeApi({ list: [CBC, TSH] });
    renderApp('/catalog');
    await screen.findByRole('table');
    expect(screen.queryAllByRole('button', { name: /delete|remove/i })).toEqual(
      [],
    );
  });
});
