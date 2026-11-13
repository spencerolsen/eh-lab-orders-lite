import pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';

import './types';

export const CONNECTION_TIMEOUT_MS = 5000;

// The app creates one pool at startup from its config (src/server/main.ts);
// tests create theirs from TEST_DATABASE_URL.
export function createPool(
  databaseUrl: string,
  logger: FastifyBaseLogger,
): pg.Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    // Give up on opening a connection after 5 seconds instead of waiting
    // forever (pg's default) when the database host does not answer.
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  // An idle connection can break, for example when the database restarts. The
  // pool reports that as an 'error' event, and with no listener Node would end
  // the process. Log it (the error code only, no connection details) and carry
  // on: the pool opens a new connection the next time one is needed.
  pool.on('error', (error: Error & { code?: string }) => {
    logger.error(
      { event: 'db.pool_error', code: error.code ?? 'unknown' },
      'An idle database connection failed',
    );
  });

  return pool;
}

export async function closePool(pool: pg.Pool): Promise<void> {
  await pool.end();
}
