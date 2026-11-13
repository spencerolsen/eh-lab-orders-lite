// The patient page: the patient form in edit mode.
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { fakePatientsApi } from '../testing/fake-patients-api';
import { renderApp } from '../testing/render';

const field = (name: string) => screen.getByLabelText(name, { exact: false });
const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

function patches(fetch: ReturnType<typeof fakePatientsApi>) {
  return fetch.mock.calls
    .filter(([, init]) => init?.method === 'PATCH')
    .map(([url, init]) => [url, JSON.parse(init?.body as string) as unknown]);
}

function errorUnder(name: string): string | null {
  const ids = field(name).getAttribute('aria-describedby')?.split(' ') ?? [];
  const errorId = ids.find((id) => id.endsWith('-error'));
  return errorId
    ? (document.getElementById(errorId)?.textContent ?? null)
    : null;
}

it('shows the stored values, with the name and date of birth as the heading', async () => {
  fakePatientsApi();
  renderApp('/patients/p1');
  expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
    'Demo Example (born Feb 29, 2020)',
  );
  expect(field('First name')).toHaveProperty('value', 'Demo');
  expect(field('Date of birth')).toHaveProperty('value', '2020-02-29');
  expect(field('Email')).toHaveProperty('value', '');
  expect(field('Phone')).toHaveProperty('value', '(801) 555-0101');
});

it('sends only the changed fields, shows "Saved", and refreshes the list', async () => {
  const fetch = fakePatientsApi();
  renderApp('/patients/p1');
  await screen.findByRole('heading', { level: 1 });
  // Retyping the same phone another way is no change; the email is new.
  await userEvent.clear(field('Phone'));
  await userEvent.type(field('Phone'), '801.555.0101');
  await userEvent.type(field('Email'), 'Demo@Example.test');
  await save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(patches(fetch)).toEqual([
    ['/api/patients/p1', { email: 'demo@example.test' }],
  ]);
  // The form starts again from the stored values.
  expect(field('Email')).toHaveProperty('value', 'demo@example.test');

  await userEvent.clear(field('Phone'));
  await userEvent.type(field('Phone'), '(801) 555-0199');
  // Editing again hides the last "Saved".
  expect(screen.queryByText('Saved')).toBeNull();
  await save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(patches(fetch).at(-1)).toEqual([
    '/api/patients/p1',
    { phone: '8015550199' },
  ]);

  await userEvent.click(screen.getByRole('link', { name: 'Back to patients' }));
  expect(await screen.findByText('(801) 555-0199')).toBeTruthy();
});

it('sends a removed phone as null', async () => {
  const fetch = fakePatientsApi();
  renderApp('/patients/p1');
  await screen.findByRole('heading', { level: 1 });
  await userEvent.type(field('Email'), 'demo@example.test');
  await userEvent.clear(field('Phone'));
  await save();
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(patches(fetch)).toEqual([
    ['/api/patients/p1', { email: 'demo@example.test', phone: null }],
  ]);
});

it('sends nothing when nothing changed', async () => {
  const fetch = fakePatientsApi();
  renderApp('/patients/p1');
  await screen.findByRole('heading', { level: 1 });
  await save();
  expect(await screen.findByText('No changes to save.')).toBeTruthy();
  expect(patches(fetch)).toEqual([]);
});

it('shows the 422 contact error under both fields, and keeps the stored patient', async () => {
  const fetch = fakePatientsApi();
  renderApp('/patients/p1');
  await screen.findByRole('heading', { level: 1 });
  await userEvent.clear(field('Phone'));
  await save();
  expect(errorUnder('Email')).toBe(
    'Email is required when there is no phone number',
  );
  expect(errorUnder('Phone')).toBe('Phone is required when there is no email');
  expect(screen.getByRole('alert').textContent).toContain('Reference: req-1');
  expect(screen.queryByText('Saved')).toBeNull();
  expect(patches(fetch)).toEqual([['/api/patients/p1', { phone: null }]]);
});

it('checks a date of birth before sending it', async () => {
  const fetch = fakePatientsApi();
  renderApp('/patients/p1');
  await screen.findByRole('heading', { level: 1 });
  await userEvent.clear(field('Date of birth'));
  await userEvent.type(field('Date of birth'), '2020-02-30');
  await save();
  expect(errorUnder('Date of birth')).toBe(
    'Date of birth must be a real calendar date',
  );
  expect(patches(fetch)).toEqual([]);
});

it('shows a not-found message with a way back for an unknown id', async () => {
  fakePatientsApi();
  renderApp('/patients/nobody');
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Patient not found' }),
  ).toBeTruthy();
  await userEvent.click(screen.getByRole('link', { name: 'Back to patients' }));
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Patients' }),
  ).toBeTruthy();
});
