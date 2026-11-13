import { describe, expect, it } from 'vitest';

import { captureLogger } from './testing/harness';

describe('createLogger', () => {
  it('writes one JSON line with the level name and the time', () => {
    const capture = captureLogger('info');
    capture.logger.info({ event: 'app.started' }, 'started');
    expect(capture.lines()).toEqual([
      {
        level: 'info',
        time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string,
        event: 'app.started',
        msg: 'started',
      },
    ]);
  });

  it('keeps only the type, message, code and stack of an error', () => {
    const capture = captureLogger('info');
    // Like a Postgres unique violation, whose detail repeats the row's values.
    const error = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      detail: 'Key (code)=(SECRET-CODE) already exists.',
    });
    capture.logger.error({ err: error }, 'failed');

    expect(capture.lines()[0]?.err).toEqual({
      type: 'Error',
      message: 'duplicate key value',
      code: '23505',
      stack: expect.stringContaining('duplicate key value') as string,
    });
    expect(capture.text()).not.toContain('SECRET-CODE');
  });

  it('leaves out lines below the level', () => {
    const capture = captureLogger('info');
    capture.logger.debug({ event: 'db.query' }, 'hidden');
    expect(capture.lines()).toEqual([]);
  });
});
