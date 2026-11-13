// The search box on the Patients list.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';

import { App } from '../App';
import { fakePatientsApi, requestedUrls } from '../testing/fake-patients-api';
import { testQueryClient } from '../testing/render';

// The current path and query, so a test can see what the page wrote to the URL.
function CurrentUrl() {
  const location = useLocation();
  return (
    <output data-testid="url">{location.pathname + location.search}</output>
  );
}

function renderAt(path: string) {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <CurrentUrl />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const url = () => screen.getByTestId('url').textContent;
const box = () => screen.getByRole('searchbox', { name: 'Search by name' });
const names = () =>
  screen
    .queryAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent);
const searches = (fetch: ReturnType<typeof fakePatientsApi>) =>
  requestedUrls(fetch).filter((u) => u.startsWith('/api/patients?'));

it('waits for typing to pause, then sends one search and writes q to the URL', async () => {
  const fetch = fakePatientsApi();
  renderAt('/patients');
  expect(await screen.findByText('Demo Example')).toBeTruthy();
  await userEvent.type(box(), 'smi');
  // Straight after typing nothing has been sent yet.
  expect(searches(fetch)).toEqual([]);
  expect(url()).toBe('/patients');
  await waitFor(() => expect(url()).toBe('/patients?q=smi'));
  await waitFor(() => expect(names()).toEqual(['Jane Smith']));
  // One request for the whole word, none for "s" or "sm".
  expect(searches(fetch)).toEqual(['/api/patients?q=smi']);
});

it('shows "No patients match" for no results, without the text, and every patient once cleared', async () => {
  fakePatientsApi();
  renderAt('/patients');
  await screen.findByText('Demo Example');
  await userEvent.type(box(), 'zzz');
  expect(await screen.findByText('No patients match')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  expect(document.querySelector('.empty-state')?.textContent).not.toContain(
    'zzz',
  );
  await userEvent.clear(box());
  await waitFor(() => expect(names()).toEqual(['Demo Example', 'Jane Smith']));
  expect(url()).toBe('/patients');
});

it('opened with ?q= (a reload), shows the text in the box and its results', async () => {
  const fetch = fakePatientsApi();
  renderAt('/patients?q=jane%20sm');
  await waitFor(() => expect(names()).toEqual(['Jane Smith']));
  expect(box()).toHaveProperty('value', 'jane sm');
  expect(requestedUrls(fetch)).not.toContain('/api/patients');
});

it('Enter searches at once, and the menu link clears the search', async () => {
  const fetch = fakePatientsApi();
  renderAt('/patients');
  await screen.findByText('Demo Example');
  await userEvent.type(box(), 'demo{Enter}');
  expect(url()).toBe('/patients?q=demo');
  await waitFor(() => expect(names()).toEqual(['Demo Example']));
  expect(searches(fetch)).toEqual(['/api/patients?q=demo']);
  await userEvent.click(screen.getByRole('link', { name: 'Patients' }));
  expect(url()).toBe('/patients');
  expect(box()).toHaveProperty('value', '');
  await waitFor(() => expect(names()).toHaveLength(2));
});

it('links each row to the patient page', async () => {
  fakePatientsApi();
  renderAt('/patients');
  await userEvent.click(
    await screen.findByRole('link', { name: 'Jane Smith' }),
  );
  expect(url()).toBe('/patients/p2');
});

it('has an Edit action on each row, named for the patient, opening the same page', async () => {
  fakePatientsApi();
  renderAt('/patients');
  await userEvent.click(
    await screen.findByRole('link', { name: 'Edit Demo Example' }),
  );
  expect(url()).toBe('/patients/p1');
});
