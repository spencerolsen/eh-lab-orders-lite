import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';

// What repositories run their SQL through: the pool, or one client inside a
// transaction, wrapped so each query's duration is logged.
export type Db = {
  query<R extends pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<R>>;
};

// Wraps a pool or client so each query logs one `db.query` line at debug level
// through `log`. Pass `request.log`, so the line carries the request id. The
// line holds the command (SELECT, INSERT, ...), the row count and the duration:
// never the SQL parameters or the rows, which can hold patient details.
export function withQueryLog(
  runner: pg.Pool | pg.PoolClient,
  log: FastifyBaseLogger,
): Db {
  return {
    async query<R extends pg.QueryResultRow>(text: string, params?: unknown[]) {
      const started = performance.now();
      const result = await runner.query<R>(text, params);
      log.debug(
        {
          event: 'db.query',
          command: result.command,
          rowCount: result.rowCount,
          durationMs: Math.round(performance.now() - started),
        },
        'Query finished',
      );
      return result;
    },
  };
}
