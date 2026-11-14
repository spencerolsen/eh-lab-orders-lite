// Checks that keep the reset commands and the tests away from the wrong database.

// The database name is the path of the connection URL, without the leading '/'.
export function databaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

// The browser tests (LAB-21) have a database of their own, so they never touch
// the development data (`lab_orders`) or the integration tests' (`_test`).
export const E2E_DATABASE = 'lab_orders_e2e';

// The reset commands drop every table, so they only run against this project's
// own databases, and never in production.
const RESETTABLE_DATABASES = ['lab_orders', 'lab_orders_test', E2E_DATABASE];

export function assertResettable(
  databaseUrl: string,
  nodeEnv: string | undefined,
): void {
  if (nodeEnv === 'production') {
    throw new Error('Refusing to reset: NODE_ENV is production');
  }
  const name = databaseName(databaseUrl);
  if (!RESETTABLE_DATABASES.includes(name)) {
    throw new Error(
      `Refusing to reset database "${name}": only lab_orders, lab_orders_test and ${E2E_DATABASE} can be reset`,
    );
  }
}

// Test tooling reads only TEST_DATABASE_URL, and only a database whose name ends
// in _test, so a test can never empty the development database.
export function testDatabaseUrl(
  env: Record<string, string | undefined>,
): string {
  const url = env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set: run `cp .env.example .env` (or, in CI, set it in the environment)',
    );
  }
  const name = databaseName(url);
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to use database "${name}" for tests: TEST_DATABASE_URL must name a database ending in _test`,
    );
  }
  return url;
}

// The browser tests' database URL: the development URL's server, user and
// password with the database name replaced by E2E_DATABASE. The name is fixed
// here and never read from a setting, so a mistyped setting cannot point the
// reset at another database.
export function e2eDatabaseUrl(
  env: Record<string, string | undefined>,
): string {
  const url = env.DATABASE_URL;
  if (!url || !URL.canParse(url)) {
    throw new Error(
      'DATABASE_URL is not set: run `cp .env.example .env` (the browser tests use its server, with their own database name)',
    );
  }
  const e2e = new URL(url);
  e2e.pathname = `/${E2E_DATABASE}`;
  return e2e.toString();
}

// The Docker database listens on host port DB_PORT (compose.yaml), and the two
// URLs carry a port of their own, so all three must agree. A URL that still
// says 5433 after DB_PORT was changed for a second copy of the project would
// reach the first copy's database, and the tests would empty it. So `pnpm dev`
// and `pnpm test` refuse to start when a URL on this machine (localhost) uses
// another port. A URL on another host is not the Docker database and is left
// alone. The same commands refuse a changed DB_PORT with the default project
// name: Compose would then recreate the first copy's container on the new port,
// with the first copy's data volume. An empty COMPOSE_PROJECT_NAME counts as
// the default, because Compose falls back to `name:` in compose.yaml.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function checkDatabasePort(
  env: Record<string, string | undefined>,
): void {
  const dbPort = env.DB_PORT || '5433';
  const project = env.COMPOSE_PROJECT_NAME || 'lab-orders-lite';
  if (dbPort !== '5433' && project === 'lab-orders-lite') {
    throw new Error(
      `DB_PORT is ${dbPort}, but COMPOSE_PROJECT_NAME is still lab-orders-lite (or empty), so this copy would take over the first copy's database: give it its own name in .env (README, "Running a second copy")`,
    );
  }
  for (const setting of ['DATABASE_URL', 'TEST_DATABASE_URL']) {
    const value = env[setting];
    if (!value || !URL.canParse(value)) continue;
    const { hostname, port } = new URL(value);
    if (!LOCAL_HOSTS.includes(hostname)) continue;
    const urlPort = port || '5432';
    if (urlPort !== dbPort) {
      throw new Error(
        `${setting} uses port ${urlPort}, but the database container listens on DB_PORT ${dbPort}: make them the same in .env`,
      );
    }
  }
}
