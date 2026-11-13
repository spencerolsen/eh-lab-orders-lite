// Runs once before the integration tests: checks TEST_DATABASE_URL (it must
// name a database ending in _test) and applies any pending migrations.
import { testDatabaseUrl } from '../db/guards';
import { migrate } from '../db/migrate';
import { withClient } from '../db/script';

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl(process.env);
  await withClient(url, async (client) => {
    await migrate(client, undefined, () => {});
  });
}
