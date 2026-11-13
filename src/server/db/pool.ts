import pg from 'pg';

import './types';

// The app creates one pool at startup from its config (the server's entry point,
// LAB-03); tests create theirs from TEST_DATABASE_URL.
export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl });
}

export async function closePool(pool: pg.Pool): Promise<void> {
  await pool.end();
}
