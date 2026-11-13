// Helpers for component tests: render the whole app at a path, with a fake
// fetch standing in for the API.
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';

import { createQueryClient } from '../api/query-client';
import { App } from '../App';

// A fetch that answers every request with this status and JSON body.
export function stubFetch(status: number, body: unknown) {
  const fetch = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

// The app's own query client, with retries made instant so a test that sees
// a retry does not wait for it.
export function testQueryClient() {
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  });
  return client;
}

// Renders the app at `path`. Unless the test stubbed fetch itself, the API
// answers /healthz with 200 { status: 'ok' }.
export function renderApp(path = '/') {
  if (!vi.isMockFunction(globalThis.fetch)) stubFetch(200, { status: 'ok' });
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
