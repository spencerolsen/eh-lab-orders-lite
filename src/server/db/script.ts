// Helpers for the database scripts (cli.ts and db/seed.ts).
import pg from 'pg';

import './types';

// Opens one connection, runs `work`, and always closes the connection.
// Importing ./types above means DATE columns read here are strings too.
export async function withClient(
  databaseUrl: string,
  work: (client: pg.Client) => Promise<void> | void,
): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
}

// Prints a short message (no stack trace) and exits with code 1.
export function exitWithError(error: unknown): never {
  const err = error as { message?: string; code?: string; cause?: unknown };
  if (err.code === 'ECONNREFUSED') {
    // Node reports a refused connection to localhost with an empty message.
    console.error(
      'Cannot connect to the database: the connection was refused.',
    );
    console.error('Is it running? Start it with `pnpm db:up`.');
  } else {
    console.error(err.message || err.code || String(error));
    if (err.cause instanceof Error) {
      console.error(`  cause: ${err.cause.message}`);
    }
  }
  process.exit(1);
}
