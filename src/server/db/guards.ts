// Checks that keep the reset commands and the tests away from the wrong database.

// The database name is the path of the connection URL, without the leading '/'.
export function databaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

// The reset commands drop every table, so they only run against this project's
// own two databases, and never in production.
const RESETTABLE_DATABASES = ['lab_orders', 'lab_orders_test'];

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
      `Refusing to reset database "${name}": only ${RESETTABLE_DATABASES.join(' and ')} can be reset`,
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
    throw new Error('TEST_DATABASE_URL is not set');
  }
  const name = databaseName(url);
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to use database "${name}" for tests: TEST_DATABASE_URL must name a database ending in _test`,
    );
  }
  return url;
}
