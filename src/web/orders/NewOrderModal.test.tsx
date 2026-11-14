// The New order modal on the orders page, with a fake API: opening and
// closing, the patient step, the quick-add box and its keyboard, submitting.
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import type { LabTest } from '../../shared/lab-tests';
import type { OrderListItem } from '../../shared/orders';
import { SEEDED } from '../testing/fake-patients-api';
import { renderApp } from '../testing/render';

const id = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lab = (
  n: number,
  code: string,
  name: string,
  isActive = true,
): LabTest => ({
  id: id(n),
  code,
  name,
  priceCents: 1000 * n,
  turnaroundDays: n,
  isActive,
});
const CBC = lab(1, 'CBC', 'Complete Blood Count');
const LIPID = lab(2, 'LIPID', 'Lipid Panel');
const OLD = lab(3, 'OLDLI', 'Retired lipid screen', false);
const CATALOG = [CBC, LIPID, OLD];

const PATIENT = {
  ...SEEDED[0]!,
  id: '20000000-0000-4000-8000-000000000001',
};

const NEW_ORDER: OrderListItem = {
  id: '40000000-0000-4000-8000-000000000001',
  status: 'ordered',
  patient: {
    id: PATIENT.id,
    firstName: PATIENT.firstName,
    lastName: PATIENT.lastName,
    dateOfBirth: PATIENT.dateOfBirth,
  },
  testCount: 1,
  totalCents: 2000,
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

// A fake API. POST /api/orders answers with `place()` (a promise, so a test
// can hold it); the order list holds what has been placed.
function fakeApi({
  catalog = (): Promise<Response> => Promise.resolve(json(200, CATALOG)),
  place = (): Promise<Response> => Promise.resolve(json(201, NEW_ORDER)),
} = {}) {
  const orders: OrderListItem[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const { pathname, searchParams } = new URL(url, 'http://localhost');
    if (pathname === '/healthz') return json(200, { status: 'ok' });
    if (pathname === '/api/lab-tests') return catalog();
    if (pathname === '/api/patients') {
      const q = (searchParams.get('q') ?? '').toLowerCase();
      return json(
        200,
        [PATIENT].filter((p) =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q),
        ),
      );
    }
    if (pathname === '/api/orders' && init?.method === 'POST') {
      const response = await place();
      if (response.ok) orders.unshift(NEW_ORDER);
      return response;
    }
    if (pathname === '/api/orders') {
      return json(200, {
        items: orders,
        hasMore: false,
        clinicTimezone: 'America/Denver',
      });
    }
    return json(404, {});
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const posts = (fetch: ReturnType<typeof fakeApi>) =>
  fetch.mock.calls.filter(
    ([url, init]) => init?.method === 'POST' && !String(url).endsWith('/quote'),
  );

async function openModal() {
  const user = userEvent.setup();
  renderApp('/');
  await user.click(
    await screen.findByRole('button', { name: 'Place new order' }),
  );
  const dialog = screen.getByRole('dialog', { name: 'New order' });
  return { user, dialog };
}

async function choosePatient(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Patient'), 'demo');
  await user.click(
    await screen.findByRole('button', {
      name: 'Demo Example (born Feb 29, 2020)',
    }),
  );
}

const quickAdd = () => screen.getByRole('combobox', { name: 'Add a test' });
// The suggestions only: the orders page behind the modal has a status select
// whose options are options too.
const suggestionOptions = () =>
  screen
    .queryAllByRole('listbox')
    .flatMap((list) => within(list).queryAllByRole('option'));
const options = () => suggestionOptions().map((option) => option.textContent);
const chosenCodes = () => {
  const table = screen.queryByRole('table', { name: 'Chosen tests' });
  if (!table) return [];
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent);
};
const submitButton = () => screen.getByRole('button', { name: 'Submit order' });

it('opens from "Place new order" with the focus in the patient search, and Cancel closes it and gives the focus back', async () => {
  fakeApi();
  const { user, dialog } = await openModal();
  expect((dialog as HTMLDialogElement).open).toBe(true);
  expect(document.activeElement).toBe(screen.getByLabelText('Patient'));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Place new order' }),
  );
});

it('stays open in StrictMode, where the opening effect runs twice (as in development)', async () => {
  fakeApi();
  const user = userEvent.setup();
  renderApp('/', { strictMode: true });
  await user.click(
    await screen.findByRole('button', { name: 'Place new order' }),
  );
  // The close event of the first run's cleanup arrives on a later task.
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(
    screen.getByRole<HTMLDialogElement>('dialog', { name: 'New order' }).open,
  ).toBe(true);
  expect(document.activeElement).toBe(screen.getByLabelText('Patient'));
});

it('closes on Escape', async () => {
  fakeApi();
  const { user } = await openModal();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Place new order' }),
  );
});

it('keeps quick-add disabled with "Choose a patient first" and Submit order disabled until a patient is chosen', async () => {
  fakeApi();
  const { user } = await openModal();
  await waitFor(() => expect(quickAdd()).toBeTruthy());
  expect((quickAdd() as HTMLInputElement).disabled).toBe(true);
  expect(quickAdd().getAttribute('aria-describedby')).toBe('quick-add-help');
  expect(screen.getByText('Choose a patient first')).toBeTruthy();
  expect((submitButton() as HTMLButtonElement).disabled).toBe(true);

  await choosePatient(user);
  expect((quickAdd() as HTMLInputElement).disabled).toBe(false);
  expect(document.activeElement).toBe(quickAdd());
  expect(screen.queryByText('Choose a patient first')).toBeNull();
  // A patient alone is not enough.
  expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
});

it('shows the chosen patient with name and date of birth, and Change goes back to the search, keeping the tests', async () => {
  fakeApi();
  const { user } = await openModal();
  await choosePatient(user);
  expect(screen.getByText('Demo Example (born Feb 29, 2020)')).toBeTruthy();
  expect(screen.queryByLabelText('Patient')).toBeNull();

  await user.type(quickAdd(), 'cbc{ArrowDown}{Enter}');
  await user.click(screen.getByRole('button', { name: 'Change' }));
  expect(document.activeElement).toBe(screen.getByLabelText('Patient'));
  expect((quickAdd() as HTMLInputElement).disabled).toBe(true);
  expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
  expect(chosenCodes()).toEqual(['CBC']);
});

it('says when no patient matches', async () => {
  fakeApi();
  const { user } = await openModal();
  await user.type(screen.getByLabelText('Patient'), 'zzz');
  expect(await screen.findByText('No patients match')).toBeTruthy();
});

it('Arrow Down then Enter adds the highlighted test and empties the box, without submitting', async () => {
  const fetch = fakeApi();
  const { user } = await openModal();
  await choosePatient(user);
  await user.type(quickAdd(), 'li');
  expect(options()).toEqual(['LIPID Lipid Panel']);
  await user.keyboard('{ArrowDown}');
  expect(
    screen
      .getByRole('option', { name: 'LIPID Lipid Panel' })
      .getAttribute('aria-selected'),
  ).toBe('true');
  await user.keyboard('{Enter}');
  expect(chosenCodes()).toEqual(['LIPID']);
  expect((quickAdd() as HTMLInputElement).value).toBe('');
  expect(posts(fetch)).toHaveLength(0);
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('Enter with nothing highlighted, or in an empty box, adds nothing and never submits', async () => {
  const fetch = fakeApi();
  const { user } = await openModal();
  await choosePatient(user);
  await user.type(quickAdd(), 'cbc{ArrowDown}{Enter}');
  expect(chosenCodes()).toEqual(['CBC']);
  // The form could now be submitted; Enter in the box still does not.
  await user.keyboard('{Enter}');
  await user.type(quickAdd(), 'li{Enter}');
  expect(chosenCodes()).toEqual(['CBC']);
  expect(posts(fetch)).toHaveLength(0);
  // Nor does Enter in the patient search.
  await user.click(screen.getByRole('button', { name: 'Change' }));
  await user.type(screen.getByLabelText('Patient'), 'demo{Enter}');
  expect(posts(fetch)).toHaveLength(0);
});

it('moves the highlight with the arrow keys, and Escape closes the suggestions before the dialog', async () => {
  fakeApi({
    catalog: () =>
      Promise.resolve(
        json(200, [
          lab(1, 'TSH', 'Thyroid'),
          lab(2, 'TSH-FREE', 'Free thyroid'),
          lab(4, 'T4', 'Thyroxine'),
        ]),
      ),
  });
  const { user } = await openModal();
  await choosePatient(user);
  await user.type(quickAdd(), 'ts');
  const selected = () =>
    suggestionOptions()
      .filter((option) => option.getAttribute('aria-selected') === 'true')
      .map((option) => option.textContent);
  expect(selected()).toEqual([]);
  await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
  expect(selected()).toEqual(['TSH-FREE Free thyroid']);
  expect(quickAdd().getAttribute('aria-activedescendant')).toBe(
    `quick-add-${id(2)}`,
  );
  await user.keyboard('{ArrowUp}');
  expect(selected()).toEqual(['TSH Thyroid']);

  await user.keyboard('{Escape}');
  expect(options()).toEqual([]);
  expect(quickAdd().getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('dialog')).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('never offers an inactive test or one already chosen, and offers at most 8', async () => {
  const many = Array.from({ length: 9 }, (_, n) =>
    lab(n + 11, `PAN${n + 1}`, `Panel ${n + 1}`),
  );
  fakeApi({
    catalog: () => Promise.resolve(json(200, [...CATALOG, ...many])),
  });
  const { user } = await openModal();
  await choosePatient(user);
  // OLDLI's code starts with "ol" and its name holds "lipid", but it is inactive.
  await user.type(quickAdd(), 'lipid');
  expect(options()).toEqual(['LIPID Lipid Panel']);
  await user.keyboard('{ArrowDown}{Enter}');
  await user.type(quickAdd(), 'lipid');
  expect(options()).toEqual([]);
  await user.clear(quickAdd());
  // Nine PAN tests match (LIPID, "Lipid Panel", is already chosen).
  await user.type(quickAdd(), 'pan');
  expect(options()).toEqual(
    ['PAN1', 'PAN2', 'PAN3', 'PAN4', 'PAN5', 'PAN6', 'PAN7', 'PAN8'].map(
      (code) => `${code} Panel ${code.slice(3)}`,
    ),
  );
});

it('adds a test on a click, and Remove takes it off and offers it again', async () => {
  fakeApi();
  const { user } = await openModal();
  await choosePatient(user);
  await user.type(quickAdd(), 'cbc');
  await user.click(
    screen.getByRole('option', { name: 'CBC Complete Blood Count' }),
  );
  const row = within(
    screen.getByRole('table', { name: 'Chosen tests' }),
  ).getAllByRole('row')[1]!;
  expect(
    Array.from(row.querySelectorAll('td'), (cell) => cell.textContent),
  ).toEqual([
    'CBC',
    'Complete Blood Count',
    '$10.00',
    '1 business day',
    'Remove',
  ]);
  await user.click(screen.getByRole('button', { name: 'Remove CBC' }));
  expect(chosenCodes()).toEqual([]);
  expect(document.activeElement).toBe(quickAdd());
  expect(screen.getByText('No tests added yet')).toBeTruthy();
  await user.type(quickAdd(), 'cbc');
  expect(options()).toEqual(['CBC Complete Blood Count']);
});

it('submits the patient and the tests, is disabled while the request runs, then closes and shows the new order first', async () => {
  let answer: (response: Response) => void = () => {};
  const fetch = fakeApi({
    place: () => new Promise<Response>((resolve) => (answer = resolve)),
  });
  const { user } = await openModal();
  expect(await screen.findByText('No orders yet')).toBeTruthy();
  await choosePatient(user);
  await user.type(quickAdd(), 'lipid{ArrowDown}{Enter}');
  await user.type(quickAdd(), 'cbc{ArrowDown}{Enter}');
  expect((submitButton() as HTMLButtonElement).disabled).toBe(false);

  await user.click(submitButton());
  expect(posts(fetch)).toHaveLength(1);
  const [url, init] = posts(fetch)[0]!;
  expect(url).toBe('/api/orders');
  expect(JSON.parse(init!.body as string)).toEqual({
    patientId: PATIENT.id,
    labTestIds: [LIPID.id, CBC.id],
  });
  expect((submitButton() as HTMLButtonElement).disabled).toBe(true);

  answer(json(201, NEW_ORDER));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    await screen.findByRole('link', {
      name: 'Demo Example (born Feb 29, 2020)',
    }),
  ).toBeTruthy();
});

it('shows a server error with its request id and keeps the modal open with the choices', async () => {
  const fetch = fakeApi({
    place: () =>
      Promise.resolve(
        json(422, {
          error: {
            code: 'INVALID_ORDER_TESTS',
            message: 'Some of the chosen tests cannot be ordered',
            requestId: 'req-place-1',
          },
        }),
      ),
  });
  const { user } = await openModal();
  await choosePatient(user);
  await user.type(quickAdd(), 'cbc{ArrowDown}{Enter}');
  await user.click(submitButton());
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Some of the chosen tests cannot be ordered. Reference: req-place-1',
  );
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText('Demo Example (born Feb 29, 2020)')).toBeTruthy();
  expect(chosenCodes()).toEqual(['CBC']);
  // It can be sent again.
  expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
  await user.click(submitButton());
  expect(posts(fetch)).toHaveLength(2);
});

it('shows loading and then an error with Try again when the catalog cannot be loaded', async () => {
  let answer: (response: Response) => void = () => {};
  fakeApi({
    catalog: () => new Promise<Response>((resolve) => (answer = resolve)),
  });
  const { user } = await openModal();
  expect(await screen.findByText('Loading tests…')).toBeTruthy();
  expect((quickAdd() as HTMLInputElement).disabled).toBe(true);
  answer(
    json(500, {
      error: { code: 'INTERNAL_ERROR', message: 'x', requestId: 'req-catalog' },
    }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Reference: req-catalog',
  );
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  answer(json(200, CATALOG));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  await choosePatient(user);
  await user.type(quickAdd(), 'cbc');
  expect(options()).toEqual(['CBC Complete Blood Count']);
});
