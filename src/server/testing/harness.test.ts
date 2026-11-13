// The harness and the integration setup must both go through the _test guard.
import { afterEach, describe, expect, it, vi } from 'vitest';

import setup from './global-setup';
import { createTestPool } from './harness';

// Port 1 refuses at once: if a guard were skipped, the error would be a
// connection error instead of the guard's message, and nothing is touched.
const DEV_DATABASE = 'postgres://lab_orders:lab_orders@127.0.0.1:1/lab_orders';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the _test guard in the harness', () => {
  it('createTestPool refuses a database whose name does not end in _test', () => {
    vi.stubEnv('TEST_DATABASE_URL', DEV_DATABASE);
    expect(() => createTestPool()).toThrow(
      /must name a database ending in _test/,
    );
  });

  it('the integration setup refuses it before starting anything', async () => {
    vi.stubEnv('TEST_DATABASE_URL', DEV_DATABASE);
    // CI set, so a missing check could not start Docker either.
    vi.stubEnv('CI', '1');
    await expect(setup()).rejects.toThrow(
      /must name a database ending in _test/,
    );
  });

  it('says how to fix a missing TEST_DATABASE_URL', () => {
    vi.stubEnv('TEST_DATABASE_URL', '');
    expect(() => createTestPool()).toThrow(/cp \.env\.example \.env/);
  });
});
