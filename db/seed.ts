// Sample data for development: `pnpm db:seed`.
//
// Every row here is obviously fake (made-up names, no real people or results).
// Each task that adds a table adds its rows to this file. Every row has a fixed
// key (a fixed UUID, or for order_items its primary key) and is inserted with
// `on conflict do nothing`, so running the seed twice leaves the same rows.
import { loadConfig } from '../src/server/config';
import { exitWithError, withClient } from '../src/server/db/script';

try {
  const { DATABASE_URL } = loadConfig();
  // No tables yet: the first rows arrive with the lab test catalog (LAB-06),
  // which inserts them through the `client` this callback receives.
  await withClient(DATABASE_URL, () => {
    const inserted = 0;
    console.log(`seed: ${inserted} row(s) inserted`);
  });
} catch (error) {
  exitWithError(error);
}
