// The integration test harness: an app built against the test database, with
// its log lines captured so tests can read them.
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { buildApp } from '../app';
import { testDatabaseUrl } from '../db/guards';
import { closePool, createPool } from '../db/pool';
import { createLogger, type LoggerOptions } from '../logger';

// One parsed JSON log line.
export type LogLine = Record<string, unknown>;

// A logger that keeps every line in memory instead of writing it out.
export function captureLogger(level: LoggerOptions['level'] = 'debug') {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  // pino writes synchronously to a plain stream, so lines are here at once.
  const logger = createLogger({ level, destination });
  return {
    logger,
    // The raw text, for checking that something never appears anywhere.
    text: () => lines.join(''),
    lines: (): LogLine[] => lines.map((line) => JSON.parse(line) as LogLine),
  };
}

// A pool on the test database (TEST_DATABASE_URL only, name ending in _test).
export function createTestPool(): pg.Pool {
  return createPool(testDatabaseUrl(process.env), captureLogger().logger);
}

export type TestApp = {
  app: FastifyInstance;
  pool: pg.Pool;
  inject: FastifyInstance['inject'];
  logs: () => LogLine[];
  logText: () => string;
  close: () => Promise<void>;
};

// Builds the app on the test database (or on `pool`, when a test needs a
// broken one), with a fixed clock and a capturing logger at debug level.
// A test may add its own routes to `app` before the first inject.
export function startTestApp(
  options: { pool?: pg.Pool; clock?: () => Date } = {},
): TestApp {
  const pool = options.pool ?? createTestPool();
  const capture = captureLogger('debug');
  const app = buildApp({
    pool,
    clock: options.clock ?? (() => new Date('2026-01-15T17:00:00Z')),
    logger: capture.logger,
  });
  return {
    app,
    pool,
    inject: app.inject.bind(app),
    logs: capture.lines,
    logText: capture.text,
    close: async () => {
      await app.close();
      await closePool(pool).catch(() => {});
    },
  };
}

// Empties every table except schema_migrations. Run before each test file
// (setup.ts), not wrapped in a transaction, so code under test can use its own.
export async function truncateAllTables(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ name: string }>(
    `select format('%I', tablename) as name from pg_tables
     where schemaname = 'public' and tablename <> 'schema_migrations'`,
  );
  if (rows.length === 0) return;
  await pool.query(
    `truncate table ${rows.map((row) => row.name).join(', ')} restart identity cascade`,
  );
}
