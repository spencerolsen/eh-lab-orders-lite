// Sample data for development: `pnpm db:seed`.
//
// Every row here is obviously fake (made-up names, no real people or results).
// Each task that adds a table adds its rows to this file. Every row has a fixed
// key (a fixed UUID, or for order_items its primary key) and is inserted with
// `on conflict do nothing`, so running the seed twice leaves the same rows.
import pg from 'pg';

import { loadConfig } from '../src/server/config';

const { DATABASE_URL } = loadConfig();
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  // No tables yet: the first rows arrive with the lab test catalog (LAB-06).
  const inserted = 0;
  console.log(`seed: ${inserted} row(s) inserted`);
} finally {
  await client.end();
}
