// Runs once before the integration tests (not for the unit project): checks
// TEST_DATABASE_URL (set, and naming a database ending in _test), starts the
// database container unless CI is set, and applies any pending migrations.
import { spawnSync } from 'node:child_process';

import { testDatabaseUrl } from '../db/guards';
import { migrate } from '../db/migrate';
import { withClient } from '../db/script';

// Starts Postgres in Docker and waits until it is healthy, as `pnpm db:up`
// does. CI provides its own database, so the step is skipped when CI is set.
function startDatabase(): void {
  if (process.env.CI) return;
  const result = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'db'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      'Could not start the database container with `docker compose up -d --wait db`: is Docker running?',
    );
  }
}

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl(process.env);
  startDatabase();
  await withClient(url, async (client) => {
    await migrate(client, undefined, () => {});
  });
}
