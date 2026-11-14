// The New patient page's duplicate warning (LAB-10) and both ways out of it:
// open the existing patient, or Create anyway. All values are fake.
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import type { Patient } from '../../shared/patients';
import { fakePatientsApi } from '../testing/fake-patients-api';
import { renderApp } from '../testing/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

const existing: Patient = {
  id: 'p7',
  firstName: 'Test',
  lastName: 'Person',
  dateOfBirth: '1984-03-09',
  email: 'test.person@example.test',
  phone: '8015550100',
};

const field = (name: string) => screen.getByLabelText(name, { exact: false });
const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Save patient' }));
// The warning: the alert region named by its heading, or null.
const panel = () =>
  screen.queryByRole('alert', { name: 'This patient may already exist' });

// The POST bodies sent so far, parsed.
function posts(fetch: ReturnType<typeof fakePatientsApi>) {
  return fetch.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => JSON.parse(init!.body as string) as unknown);
}

// Fills the form for a new patient with the existing patient's email in
// other letter case, and saves: the fake answers 409 POSSIBLE_DUPLICATE.
async function submitDuplicate() {
  const fetch = fakePatientsApi([structuredClone(existing)]);
  renderApp('/patients/new');
  await userEvent.type(field('First name'), 'Other');
  await userEvent.type(field('Last name'), 'Sample');
  await userEvent.type(field('Date of birth'), '1990-01-01');
  await userEvent.type(field('Email'), 'Test.Person@Example.test');
  await save();
  await screen.findByRole('heading', {
    name: 'This patient may already exist',
  });
  return fetch;
}

const newBody = {
  firstName: 'Other',
  lastName: 'Sample',
  dateOfBirth: '1990-01-01',
  email: 'test.person@example.test',
};

it('shows the match with name, date of birth, email and phone, focused, and keeps the form filled', async () => {
  const fetch = await submitDuplicate();
  const warning = panel()!;
  expect(document.activeElement).toBe(warning);
  expect(warning.getAttribute('aria-labelledby')).toBe(
    screen.getByRole('heading', { name: 'This patient may already exist' }).id,
  );
  const [item, ...others] = within(warning).getAllByRole('listitem');
  expect(others).toEqual([]);
  expect(item!.textContent).toContain('Test Person (born Mar 9, 1984)');
  expect(item!.textContent).toContain('Email: test.person@example.test');
  expect(item!.textContent).toContain('Phone: (801) 555-0100');
  // The warning sits above the form.
  expect(
    warning.compareDocumentPosition(field('First name')) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(field('First name')).toHaveProperty('value', 'Other');
  expect(field('Email')).toHaveProperty('value', 'Test.Person@Example.test');
  expect(posts(fetch)).toEqual([newBody]);
});

it('says "none" for a missing email or phone', async () => {
  fakePatientsApi([{ ...existing, phone: null }]);
  renderApp('/patients/new');
  await userEvent.type(field('First name'), 'Other');
  await userEvent.type(field('Last name'), 'Sample');
  await userEvent.type(field('Date of birth'), '1990-01-01');
  await userEvent.type(field('Email'), existing.email!);
  await save();
  expect(
    (
      await screen.findByRole('alert', {
        name: 'This patient may already exist',
      })
    ).textContent,
  ).toContain('Phone: none');
});

it('Open this patient goes to that patient, and nothing was created', async () => {
  const fetch = await submitDuplicate();
  const open = within(panel()!).getByRole('link', {
    name: 'Open this patient',
  });
  expect(open.getAttribute('href')).toBe('/patients/p7');
  await userEvent.click(open);
  expect(
    (await screen.findByRole('heading', { level: 1 })).textContent,
  ).toContain('Test Person');
  expect(posts(fetch)).toHaveLength(1);
});

it('Create anyway sends the same values with confirmDuplicate: true, then the list shows both', async () => {
  const fetch = await submitDuplicate();
  const createAnyway = within(panel()!).getByRole('button', {
    name: 'Create anyway',
  });
  // The secondary path: Save stays the primary button.
  expect(createAnyway.className).toBe('button-secondary');
  await userEvent.click(createAnyway);
  await screen.findByRole('heading', { level: 1, name: 'Patients' });
  expect(posts(fetch)).toEqual([
    newBody,
    { ...newBody, confirmDuplicate: true },
  ]);
  expect(screen.getByText('Test Person')).toBeTruthy();
  expect(screen.getByText('Other Sample')).toBeTruthy();
});

it('editing any field removes the warning, and the next save checks again', async () => {
  const fetch = await submitDuplicate();
  await userEvent.type(field('Last name'), 's');
  expect(panel()).toBeNull();
  await save();
  await screen.findByRole('heading', {
    name: 'This patient may already exist',
  });
  // No confirmDuplicate: the confirmation is never sticky.
  expect(posts(fetch)).toEqual([newBody, { ...newBody, lastName: 'Samples' }]);
});

it('disables both buttons while Create anyway runs', async () => {
  const fetch = await submitDuplicate();
  const real = fetch.getMockImplementation()!;
  let release!: () => void;
  fetch.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? new Promise<Response>((resolve) => {
          release = () => void real(url, init).then(resolve);
        })
      : real(url, init),
  );
  await userEvent.click(
    within(panel()!).getByRole('button', { name: 'Create anyway' }),
  );
  expect(
    within(panel()!).getByRole('button', { name: 'Creating…' }),
  ).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Save patient' })).toHaveProperty(
    'disabled',
    true,
  );
  release();
  await screen.findByRole('heading', { level: 1, name: 'Patients' });
});

it('shows why Create anyway failed inside the warning', async () => {
  const fetch = await submitDuplicate();
  const real = fetch.getMockImplementation()!;
  fetch.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Something went wrong on our side',
                requestId: 'req-9',
              },
            }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          ),
        )
      : real(url, init),
  );
  await userEvent.click(
    within(panel()!).getByRole('button', { name: 'Create anyway' }),
  );
  expect(
    (await within(panel()!).findByText(/Reference: req-9/)).textContent,
  ).toContain('Reference: req-9');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'New patient',
  );
});
