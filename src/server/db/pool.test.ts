import { describe, expect, it } from 'vitest';

import { captureLogger } from '../testing/harness';
import { closePool, createPool } from './pool';

describe('createPool', () => {
  it('logs a broken idle connection as one error line instead of crashing', async () => {
    const capture = captureLogger('debug');
    // No query is run, so this never connects.
    const pool = createPool(
      'postgres://lab_orders:s3cret-pw@db.example.test:5433/lab_orders_test',
      capture.logger,
    );

    const error = Object.assign(new Error('terminating connection'), {
      code: '57P01',
    });
    pool.emit('error', error);

    const lines = capture.lines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'error',
      event: 'db.pool_error',
      code: '57P01',
    });
    expect(capture.text()).not.toContain('s3cret-pw');
    expect(capture.text()).not.toContain('db.example.test');
    expect(capture.text()).not.toContain('terminating connection');
    await closePool(pool);
  });
});
