// Starts the API server: `pnpm dev:api` (development, readable logs) or
// `pnpm start` (JSON logs). Runs under tsx, because imports are extensionless.
import { buildApp } from './app';
import { loadConfig } from './config';
import { closePool, createPool } from './db/pool';
import { createLogger } from './logger';

// How long in-flight requests get to finish after SIGTERM or SIGINT.
const SHUTDOWN_CAP_MS = 10_000;

const config = loadConfig();
const logger = createLogger({
  level: config.LOG_LEVEL,
  pretty: process.env.NODE_ENV === 'development',
});
const pool = createPool(config.DATABASE_URL, logger);
const app = buildApp({ pool, clock: () => new Date(), logger });

let shuttingDown = false;

// Stops accepting connections, lets in-flight requests finish, closes the
// pool and exits 0. If that takes longer than the cap, it exits 1.
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'app.shutting_down', signal }, 'Shutting down');

  const cap = setTimeout(() => {
    logger.error(
      { event: 'app.shutdown_timeout', capMs: SHUTDOWN_CAP_MS },
      'Requests were still running when the shutdown cap ran out',
    );
    process.exit(1);
  }, SHUTDOWN_CAP_MS);
  cap.unref();

  try {
    await app.close();
    await closePool(pool);
    process.exit(0);
  } catch (error) {
    logger.error(
      { event: 'app.shutdown_failed', err: error },
      'Shutdown failed',
    );
    process.exit(1);
  }
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

try {
  // 'localhost' listens on both 127.0.0.1 and ::1, whichever the caller uses.
  await app.listen({ port: config.PORT, host: 'localhost' });
  logger.info(
    { event: 'app.started', port: config.PORT },
    'API server started',
  );
} catch (error) {
  logger.error(
    { event: 'app.start_failed', err: error },
    'API server failed to start',
  );
  await closePool(pool);
  process.exit(1);
}
