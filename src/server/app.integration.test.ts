// The app's request handling end to end: the error shape, request ids and the
// request log lines, through the real Fastify app on the test database.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { withQueryLog } from './db/query';
import {
  BusinessRuleError,
  ConflictError,
  type ErrorCode,
  INTERNAL_ERROR_MESSAGE,
  NotFoundError,
  ValidationError,
} from './errors';
import { parse } from './parse';
import { type LogLine, startTestApp, type TestApp } from './testing/harness';

let t: TestApp;

beforeEach(() => {
  t = startTestApp();
  // Routes that exist only in these tests, added before the first request.
  t.app.get('/test/boom', () => {
    throw new Error('original secret message');
  });
  t.app.post('/test/items/:id', (request) => {
    const body = parse(z.strictObject({ name: z.string() }), request.body);
    return { ok: true, name: body.name };
  });
  t.app.get('/test/query', async (request) => {
    const db = withQueryLog(t.pool, request.log);
    const { rows } = await db.query<{ value: string }>(
      'select $1::text as value',
      ['Sensitive-Param-987'],
    );
    return { count: rows.length };
  });
  t.app.get('/test/bad-date', async (request) => {
    const db = withQueryLog(t.pool, request.log);
    // Postgres repeats the value in its error message.
    await db.query('select $1::date', ['Sentinel Jane 1980-02-03']);
    return { reached: true };
  });
});

afterEach(async () => {
  await t.close();
});

const linesFor = (requestId: string): LogLine[] =>
  t.logs().filter((line) => line.requestId === requestId);

describe('errors', () => {
  it('unknown route returns the standard 404 shape', async () => {
    const response = await t.inject({
      method: 'GET',
      url: '/nope/patient-42?q=Smith',
    });

    const requestId = response.headers['x-request-id'] as string;
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'There is nothing at this address',
        requestId,
      },
    });
    // The completion line has no pattern to log, and never the raw path.
    expect(linesFor(requestId)).toContainEqual(
      expect.objectContaining({
        event: 'request.completed',
        route: '(unmatched)',
        statusCode: 404,
      }),
    );
    expect(t.logText()).not.toContain('patient-42');
    expect(t.logText()).not.toContain('Smith');
  });

  it('unexpected error returns generic 500 and hides the message', async () => {
    const response = await t.inject({ method: 'GET', url: '/test/boom' });

    const requestId = response.headers['x-request-id'] as string;
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: INTERNAL_ERROR_MESSAGE,
        requestId,
      },
    });
    expect(response.body).not.toContain('original secret message');
    expect(response.body).not.toContain('at ');

    // The stack is in the log, on an error line with the same request id.
    const failed = linesFor(requestId).find(
      (line) => line.event === 'request.failed',
    );
    expect(failed?.level).toBe('error');
    expect((failed?.err as { stack: string }).stack).toContain(
      'original secret message',
    );
  });

  it.each([
    { error: new ValidationError([]), status: 400 },
    { error: new NotFoundError('Patient not found'), status: 404 },
    {
      error: new ConflictError('TEST_CONFLICT' as ErrorCode, 'Taken'),
      status: 409,
    },
    {
      error: new BusinessRuleError('TEST_RULE' as ErrorCode, 'Not allowed'),
      status: 422,
    },
  ])(
    'a thrown $error.name reaches the caller as $status, logged at warn',
    async ({ error, status }) => {
      t.app.get('/test/typed', () => {
        throw error;
      });
      const response = await t.inject({ method: 'GET', url: '/test/typed' });
      const requestId = response.headers['x-request-id'] as string;

      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({
        error: { code: error.code, message: error.message, requestId },
      });
      expect(linesFor(requestId)).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          event: 'request.rejected',
          statusCode: status,
        }),
      );
    },
  );

  it('a body with an unknown extra field returns 400 VALIDATION_ERROR', async () => {
    const response = await t.inject({
      method: 'POST',
      url: '/test/items/1',
      payload: { name: 'A', isAdmin: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: [{ field: 'isAdmin', reason: 'is not an allowed field' }],
      },
    });
  });

  it.each([
    {
      name: 'malformed JSON',
      payload: '{"name": ',
      type: 'application/json',
      status: 400,
      code: 'VALIDATION_ERROR',
    },
    {
      name: 'an empty JSON body',
      payload: '',
      type: 'application/json',
      status: 400,
      code: 'VALIDATION_ERROR',
    },
    {
      name: 'a body over 1 MiB',
      payload: JSON.stringify({ name: 'x'.repeat(1_100_000) }),
      type: 'application/json',
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    },
    {
      name: 'an XML body',
      payload: '<name>A</name>',
      type: 'application/xml',
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    },
    {
      name: 'a text/plain body',
      payload: 'name=A',
      type: 'text/plain',
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    },
  ])(
    'Fastify refusing $name comes out in the standard shape',
    async ({ payload, type, status, code }) => {
      const response = await t.inject({
        method: 'POST',
        url: '/test/items/1',
        headers: { 'content-type': type },
        payload,
      });
      const requestId = response.headers['x-request-id'] as string;
      expect(response.statusCode).toBe(status);
      expect(Object.keys(response.json<object>())).toEqual(['error']);
      expect(response.json()).toMatchObject({ error: { code, requestId } });
      // Fastify's own message is never passed on.
      expect(response.body).not.toMatch(/FST_|Unexpected|token|content-type/i);
    },
  );

  it('a malformed URL comes out in the standard shape, with a log line', async () => {
    const response = await t.inject({
      method: 'GET',
      url: '/patients/%E0%A4%A',
      headers: { 'x-request-id': 'bad-url-1' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers['x-request-id']).toBe('bad-url-1');
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request could not be read',
        requestId: 'bad-url-1',
      },
    });
    expect(linesFor('bad-url-1')).toContainEqual(
      expect.objectContaining({
        event: 'request.completed',
        route: '(unmatched)',
        statusCode: 400,
      }),
    );
    expect(t.logText()).not.toContain('%E0');
  });
});

describe('shutdown', () => {
  it('a request that arrives while closing gets 503 in the standard shape; a running one finishes', async () => {
    let started!: () => void;
    let release!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    t.app.get('/test/slow', async () => {
      started();
      await gate;
      return { done: true };
    });

    const slow = t.inject({ method: 'GET', url: '/test/slow' });
    await running;
    const closed = t.app.close();

    const late = await t.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'late-1' },
    });
    expect(late.statusCode).toBe(503);
    expect(late.headers['x-request-id']).toBe('late-1');
    expect(late.json()).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The server is restarting. Try again in a moment.',
        requestId: 'late-1',
      },
    });

    release();
    expect((await slow).json()).toEqual({ done: true });
    await closed;
  });
});

describe('request ids and logging', () => {
  it('logs contain request id and no body or query string', async () => {
    const response = await t.inject({
      method: 'POST',
      url: '/test/items/item-42?search=Smithson&dob=1980-02-03',
      headers: {
        'x-request-id': 'abc-123',
        'x-secret-header': 'header-value-77',
      },
      payload: { name: 'Jane Testperson' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('abc-123');

    const lines = t.logs();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.requestId).toBe('abc-123');
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'info',
        event: 'request.completed',
        method: 'POST',
        route: '/test/items/:id',
        statusCode: 200,
        durationMs: expect.any(Number) as number,
      }),
    );

    const text = t.logText();
    for (const secret of [
      'Testperson',
      'Smithson',
      'search=',
      '1980-02-03',
      'item-42',
      'header-value-77',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('a malformed request id is replaced, in the header, the body and the log', async () => {
    const response = await t.inject({
      method: 'GET',
      url: '/test/boom',
      headers: { 'x-request-id': 'has spaces "and quotes"' },
    });
    const requestId = response.headers['x-request-id'] as string;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      response.json<{ error: { requestId: string } }>().error.requestId,
    ).toBe(requestId);
    expect(linesFor(requestId).length).toBeGreaterThan(0);
    expect(t.logText()).not.toContain('has spaces');
  });

  it('a rejected request logs a field count, not its body, keys or query string', async () => {
    const response = await t.inject({
      method: 'POST',
      url: '/test/items/1?q=Sentinel-Query',
      headers: { 'x-request-id': 'rejected-1' },
      payload: { name: ['Sentinel-Value'], 'Sentinel-Key-1': true },
    });

    expect(response.statusCode).toBe(400);
    // The caller still gets the field names back: it sent them.
    expect(response.body).toContain('Sentinel-Key-1');
    expect(linesFor('rejected-1')).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        event: 'request.rejected',
        code: 'VALIDATION_ERROR',
        fieldCount: 2,
      }),
    );
    expect(t.logText()).not.toContain('Sentinel');
  });

  it('a database error that repeats a submitted value is logged without it', async () => {
    const response = await t.inject({
      method: 'GET',
      url: '/test/bad-date',
      headers: { 'x-request-id': 'pg-1' },
    });

    expect(response.statusCode).toBe(500);
    const failed = linesFor('pg-1').find(
      (line) => line.event === 'request.failed',
    );
    expect(failed?.err).toMatchObject({ type: 'DatabaseError', code: '22007' });
    expect(t.logText()).not.toContain('Sentinel');
  });

  it('query duration is logged at debug without parameters', async () => {
    const response = await t.inject({
      method: 'GET',
      url: '/test/query',
      headers: { 'x-request-id': 'query-1' },
    });
    expect(response.json()).toEqual({ count: 1 });

    expect(linesFor('query-1')).toContainEqual(
      expect.objectContaining({
        level: 'debug',
        event: 'db.query',
        command: 'SELECT',
        rowCount: 1,
        durationMs: expect.any(Number) as number,
      }),
    );
    // Neither the parameter nor the row (which holds the same value) is logged.
    expect(t.logText()).not.toContain('Sensitive-Param-987');
  });
});
