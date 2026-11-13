import pg from 'pg';

import './types';

// The app creates one pool at startup from its config (the server's entry point,
// LAB-03); tests create theirs from TEST_DATABASE_URL.
export function createPool(databaseUrl: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  // An idle connection can break, for example when the database restarts. The
  // pool reports that as an 'error' event, and with no listener Node would end
  // the process. Log it (the error code only, no connection details) and carry
  // on: the pool opens a new connection the next time one is needed.
  // LAB-03 sends this line through the app's logger.
  pool.on('error', (error: Error & { code?: string }) => {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'db.pool_error',
        code: error.code ?? 'unknown',
      }),
    );
  });

  return pool;
}

export async function closePool(pool: pg.Pool): Promise<void> {
  await pool.end();
}
