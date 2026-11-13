// The database commands behind `pnpm db:migrate`, `pnpm db:reset` and
// `pnpm db:test:reset`. Usage: tsx src/server/db/cli.ts <migrate|reset|test-reset>
import pg from 'pg';

import { loadConfig } from '../config';
import { assertResettable, testDatabaseUrl } from './guards';
import { migrate, resetSchema } from './migrate';

async function withClient(
  databaseUrl: string,
  work: (client: pg.Client) => Promise<void>,
) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
}

async function main(command: string | undefined): Promise<void> {
  switch (command) {
    case 'migrate': {
      const { DATABASE_URL } = loadConfig();
      await withClient(DATABASE_URL, async (client) => {
        await migrate(client);
      });
      return;
    }
    case 'reset': {
      const { DATABASE_URL } = loadConfig();
      assertResettable(DATABASE_URL, process.env.NODE_ENV);
      await withClient(DATABASE_URL, async (client) => {
        await resetSchema(client);
        await migrate(client);
      });
      return;
    }
    case 'test-reset': {
      // Uses only TEST_DATABASE_URL, not the app's config.
      const url = testDatabaseUrl(process.env);
      assertResettable(url, process.env.NODE_ENV);
      await withClient(url, async (client) => {
        await resetSchema(client);
        await migrate(client);
      });
      return;
    }
    default:
      throw new Error('Usage: cli.ts <migrate|reset|test-reset>');
  }
}

try {
  await main(process.argv[2]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause instanceof Error) {
    console.error(`  cause: ${error.cause.message}`);
  }
  process.exit(1);
}
