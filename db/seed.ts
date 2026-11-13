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
import { seedOrders } from './seeds/orders';
import { seedPatients } from './seeds/patients';

// What a seed may need from the settings: the orders seed works out each
// ready date in the clinic's time zone.
type SeedOptions = { clinicTimezone: string };

// In order: a table's rows come after the rows they point at.
const SEEDS: Array<
  (client: pg.ClientBase, options: SeedOptions) => Promise<number>
> = [seedLabTests, seedPatients, seedOrders];

try {
  const { DATABASE_URL, CLINIC_TIMEZONE } = loadConfig();
  // A URL on the wrong port could reach another copy's database.
  checkDatabasePort(process.env);
  await withClient(DATABASE_URL, async (client) => {
    let inserted = 0;
    for (const seed of SEEDS) {
      inserted += await seed(client, { clinicTimezone: CLINIC_TIMEZONE });
    }
    console.log(`seed: ${inserted} row(s) inserted`);
  });
} catch (error) {
  exitWithError(error);
}
