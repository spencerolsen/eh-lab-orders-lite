import { afterEach, describe, expect, it, vi } from 'vitest';

import { closePool, createPool } from './pool';

describe('createPool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a broken idle connection as one JSON line instead of crashing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // No query is run, so this never connects.
    const pool = createPool(
      'postgres://lab_orders:s3cret-pw@db.example.test:5433/lab_orders_test',
    );

    const error = Object.assign(new Error('terminating connection'), {
      code: '57P01',
    });
    pool.emit('error', error);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      level: 'error',
      event: 'db.pool_error',
      code: '57P01',
    });
    expect(line).not.toContain('s3cret-pw');
    expect(line).not.toContain('db.example.test');
    await closePool(pool);
  });
});
