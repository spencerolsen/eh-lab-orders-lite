import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import type { Patient } from '../../shared/patients';
import { renderApp } from '../testing/render';

const SEEDED: Patient[] = [
  {
    id: 'p1',
    firstName: 'Demo',
    lastName: 'Example',
    dateOfBirth: '2020-02-29',
    email: null,
    phone: '8015550101',
  },
  {
    id: 'p2',
    firstName: 'Test',
    lastName: 'Patient',
    dateOfBirth: '1984-03-09',
    email: 'test.patient@example.test',
    phone: null,
  },
];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// A fake API: /healthz is fine, GET /api/patients lists `patients`, and POST
// adds the body to it.
function fakeApi(patients: Patient[]) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/healthz') return Promise.resolve(json(200, { status: 'ok' }));
    if (init?.method === 'POST') {
      const sent = JSON.parse(init.body as string) as Partial<Patient>;
      const created: Patient = {
        id: 'new',
        firstName: sent.firstName ?? '',
        lastName: sent.lastName ?? '',
        dateOfBirth: sent.dateOfBirth ?? '',
        email: sent.email ?? null,
        phone: sent.phone ?? null,
      };
      patients.push(created);
      return Promise.resolve(json(201, created));
    }
    return Promise.resolve(json(200, patients));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function rowTexts(): (string | null)[][] {
  const [, ...rows] = screen.getAllByRole('row');
  return rows.map((row) =>
    Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent),
  );
}

it('lists the patients with their date of birth as typed', async () => {
  fakeApi([...SEEDED]);
  renderApp('/patients');
  expect(await screen.findByRole('table')).toBeTruthy();
  expect(rowTexts()).toEqual([
    ['Demo Example', 'Feb 29, 2020', '', '(801) 555-0101'],
    ['Test Patient', 'Mar 9, 1984', 'test.patient@example.test', ''],
  ]);
});

it('shows the empty state when there are no patients', async () => {
  fakeApi([]);
  renderApp('/patients');
  expect(
    await screen.findByText(
      'No patients yet. Add the first one with New patient.',
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});

it('shows the error with its reference when the list fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/healthz'
          ? json(200, { status: 'ok' })
          : json(500, {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'x',
                requestId: 'req-3',
              },
            }),
      ),
    ),
  );
  renderApp('/patients');
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Reference: req-3',
  );
});

it('New patient opens the form, and saving goes back to the refreshed list', async () => {
  const fetch = fakeApi([...SEEDED]);
  renderApp('/patients');
  await userEvent.click(
    await screen.findByRole('link', { name: 'New patient' }),
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'New patient' }),
  ).toBeTruthy();

  await userEvent.type(screen.getByLabelText('First name'), 'Sample');
  await userEvent.type(screen.getByLabelText('Last name'), 'Person');
  await userEvent.type(screen.getByLabelText(/Date of birth/), '1990-12-31');
  await userEvent.type(screen.getByLabelText('Email'), 'Sample@Example.test');
  await userEvent.click(screen.getByRole('button', { name: 'Save patient' }));

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Patients' }),
  ).toBeTruthy();
  expect(await screen.findByText('Sample Person')).toBeTruthy();
  const post = fetch.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(JSON.parse(post?.[1]?.body as string)).toEqual({
    firstName: 'Sample',
    lastName: 'Person',
    dateOfBirth: '1990-12-31',
    email: 'sample@example.test',
  });
});
