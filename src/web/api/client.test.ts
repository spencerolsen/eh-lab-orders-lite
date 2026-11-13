import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  apiFetch,
  UNREACHABLE_CODE,
  UNREACHABLE_MESSAGE,
} from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWith(
  body: string | null,
  status: number,
  contentType = 'application/json',
) {
  const fetch = vi.fn(() =>
    Promise.resolve(
      new Response(body, { status, headers: { 'content-type': contentType } }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('apiFetch', () => {
  it('returns the parsed JSON body of a 2xx response', async () => {
    respondWith('{"status":"ok"}', 200);
    await expect(apiFetch('/healthz')).resolves.toEqual({ status: 'ok' });
  });

  it('returns undefined for a 204 with no body', async () => {
    respondWith(null, 204);
    await expect(
      apiFetch('/api/x', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  it('sends a body as JSON with the method given', async () => {
    const fetch = respondWith('{}', 201);
    await apiFetch('/api/lab-tests', { method: 'POST', body: { code: 'CBC' } });
    expect(fetch).toHaveBeenCalledWith('/api/lab-tests', {
      method: 'POST',
      signal: undefined,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{"code":"CBC"}',
    });
  });

  it('apiFetch throws ApiError with code, message and requestId from the standard shape', async () => {
    respondWith(
      JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request is not valid',
          details: [{ field: 'name', reason: 'is required' }],
          requestId: 'req-42',
        },
      }),
      400,
    );
    const error = await caught(apiFetch('/api/patients'));
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'The request is not valid',
      requestId: 'req-42',
      details: [{ field: 'name', reason: 'is required' }],
    });
  });

  it('apiFetch handles a non-JSON 502 with the plain message', async () => {
    respondWith('<html><body>Bad Gateway</body></html>', 502, 'text/html');
    const error = await caught(apiFetch('/api/patients'));
    expect(error).toMatchObject({
      status: 502,
      code: UNREACHABLE_CODE,
      message: UNREACHABLE_MESSAGE,
      requestId: undefined,
    });
    expect(UNREACHABLE_MESSAGE).toBe("Can't reach the server. Try again.");
  });

  it.each([
    { name: 'an empty 500', body: '', status: 500 },
    {
      name: 'JSON that is not the standard shape',
      body: '{"status":"unavailable"}',
      status: 503,
    },
    {
      name: 'an error body with no request id',
      body: '{"error":{"code":"X","message":"m"}}',
      status: 400,
    },
    {
      name: 'a 200 that is not JSON (an HTML page)',
      body: '<!doctype html>',
      status: 200,
    },
  ])('treats $name as "can\'t reach the server"', async ({ body, status }) => {
    respondWith(body, status);
    const error = await caught(apiFetch('/api/patients'));
    expect(error).toMatchObject({
      status,
      code: UNREACHABLE_CODE,
      requestId: undefined,
    });
  });

  it('turns a network failure into "can\'t reach the server" with status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const error = await caught(apiFetch('/healthz'));
    expect(error).toMatchObject({
      status: 0,
      code: UNREACHABLE_CODE,
      message: UNREACHABLE_MESSAGE,
    });
  });

  it('lets a cancelled request end with the abort, not an ApiError', async () => {
    const controller = new AbortController();
    const abort = new DOMException('aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        controller.abort();
        return Promise.reject(abort);
      }),
    );
    await expect(
      apiFetch('/healthz', { signal: controller.signal }),
    ).rejects.toBe(abort);
  });
});
