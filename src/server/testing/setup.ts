// Runs before each integration test file: every file starts with empty tables.
import { beforeAll } from 'vitest';

import { closePool } from '../db/pool';
import { createTestPool, truncateAllTables } from './harness';

beforeAll(async () => {
  const pool = createTestPool();
  try {
    await truncateAllTables(pool);
  } finally {
    await closePool(pool);
  }
});
