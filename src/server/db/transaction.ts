import type pg from 'pg';

// Runs `work` on one connection inside a transaction: commit if it returns,
// rollback if it throws (the error is passed on). All or nothing: every query
// `work` runs on `client` is saved together, or none is.
export async function inTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  // A connection whose rollback failed is in an unknown state: it is thrown
  // away instead of going back to the pool.
  let broken = false;
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
