// Sample data for development: `pnpm db:seed`.
//
// Every row is obviously fake (made-up names, no real people or results). Each
// task that adds a table adds a seed function in db/seeds/ and one line to
// SEEDS. Every row has a fixed key (a fixed UUID, or for order_items its
// primary key) and is inserted with `on conflict do nothing`, so running the
// seed twice leaves the same rows.
import type pg from 'pg';

import { loadConfig } from '../src/server/config';
import { checkDatabasePort } from '../src/server/db/guards';
import { exitWithError, withClient } from '../src/server/db/script';
import { seedLabTests } from './seeds/lab-tests';
import { seedPatients } from './seeds/patients';

// In order: a table's rows come after the rows they point at.
const SEEDS: Array<(client: pg.ClientBase) => Promise<number>> = [
  seedLabTests,
  seedPatients,
];

try {
  const { DATABASE_URL } = loadConfig();
  // A URL on the wrong port could reach another copy's database.
  checkDatabasePort(process.env);
  await withClient(DATABASE_URL, async (client) => {
    let inserted = 0;
    for (const seed of SEEDS) inserted += await seed(client);
    console.log(`seed: ${inserted} row(s) inserted`);
  });
} catch (error) {
  exitWithError(error);
}
