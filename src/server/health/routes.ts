import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import type { HealthOk } from '../../shared/health';

// How long the database gets to answer, counting both getting a connection and
// running the query. A host that is down or unreachable never answers at all,
// so the check gives up after this long and replies 503 (well within the
// 3 seconds a caller may wait).
export const HEALTH_TIMEOUT_MS = 2000;

class HealthTimeout extends Error {
  readonly code = 'HEALTH_TIMEOUT';
}

async function databaseAnswers(pool: pg.Pool): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HealthTimeout()), HEALTH_TIMEOUT_MS);
  });
  // query_timeout ends the query itself if the server is slow to answer it
  // (pg supports it per query; its type definitions only list it for the
  // client, hence the cast). The race above also covers a connection that
  // never opens; the pool's connection timeout (db/pool.ts) frees that slot.
  const query = pool.query({
    text: 'select 1',
    query_timeout: HEALTH_TIMEOUT_MS,
  } as pg.QueryConfig);
  // If the timer wins, the query fails later on its own: ignore that.
  query.catch(() => {});
  try {
    await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// GET /healthz: 200 { status: 'ok' } when the database answers `select 1`,
// otherwise 503 { status: 'unavailable' }. It reports nothing else.
export function healthRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get('/healthz', async (request, reply) => {
    try {
      await databaseAnswers(pool);
      return { status: 'ok' } satisfies HealthOk;
    } catch (error) {
      // The error code only: the message of a connection error names the host.
      const { code } = error as { code?: unknown };
      request.log.error(
        {
          event: 'health.db_unavailable',
          code: typeof code === 'string' ? code : 'unknown',
        },
        'Health check failed: the database did not answer',
      );
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
