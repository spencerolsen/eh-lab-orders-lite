// The harness and the integration setup must both go through the _test guard.
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

import setup from './global-setup';

// The integration setup starts Docker with spawnSync: replaced here, so the
// test can see whether it was called and never starts a real container.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));
import { createTestPool } from './harness';

// Port 1 refuses at once: if a guard were skipped, the error would be a
// connection error instead of the guard's message, and nothing is touched.
const DEV_DATABASE = 'postgres://lab_orders:lab_orders@127.0.0.1:1/lab_orders';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(spawnSync).mockClear();
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
    // CI not set, so the setup would start the container if it got that far.
    vi.stubEnv('CI', '');
    await expect(setup()).rejects.toThrow(
      /must name a database ending in _test/,
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('the integration setup refuses a URL port that is not DB_PORT before starting anything', async () => {
    vi.stubEnv(
      'TEST_DATABASE_URL',
      'postgres://lab_orders:lab_orders@127.0.0.1:1/lab_orders_test',
    );
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DB_PORT', '5434');
    vi.stubEnv('CI', '');
    await expect(setup()).rejects.toThrow(
      /TEST_DATABASE_URL uses port 1, but the database container listens on DB_PORT 5434/,
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('says how to fix a missing TEST_DATABASE_URL', () => {
    vi.stubEnv('TEST_DATABASE_URL', '');
    expect(() => createTestPool()).toThrow(/cp \.env\.example \.env/);
  });
});
