import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { createPool } from '../db/pool';
import { captureLogger, startTestApp, type TestApp } from '../testing/harness';

let t: TestApp | undefined;

afterEach(async () => {
  await t?.close();
  t = undefined;
});

describe('GET /healthz', () => {
  it('healthz returns ok', async () => {
    t = startTestApp();
    const response = await t.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('healthz returns 503 when the pool is closed', async () => {
    t = startTestApp();
    await t.pool.end();

    const response = await t.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(t.logs()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        event: 'health.db_unavailable',
      }),
    );
  });

  it('healthz returns 503 within 3 seconds when the database never answers', async () => {
    // A server that accepts connections and then says nothing, like a
    // database host that is up at the network level but not answering.
    const sockets: net.Socket[] = [];
    const silent = net.createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) =>
      silent.listen(0, '127.0.0.1', resolve),
    );
    const { port } = silent.address() as net.AddressInfo;
    try {
      t = startTestApp({
        pool: createPool(
          `postgres://nobody:nothing@127.0.0.1:${port}/never_test`,
          captureLogger().logger,
        ),
      });

      const started = performance.now();
      const response = await t.inject({ method: 'GET', url: '/healthz' });
      const elapsed = performance.now() - started;

      expect(response.statusCode).toBe(503);
      expect(elapsed).toBeLessThan(3000);
      expect(t.logs()).toContainEqual(
        expect.objectContaining({
          level: 'error',
          event: 'health.db_unavailable',
          code: 'HEALTH_TIMEOUT',
        }),
      );
    } finally {
      // End the hanging connection so the pool can close.
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => silent.close(resolve));
    }
  });
});
