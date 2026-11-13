import pg from 'pg';
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

  it('logs a Postgres error by code and schema names, never its message', () => {
    const capture = captureLogger('info');
    // Like pg's error for `select $1::date` with a name as the value.
    const error = new pg.DatabaseError(
      'invalid input syntax for type date: "Sentinel Jane 1980-02-03"',
      100,
      'error',
    );
    error.code = '22007';
    error.detail = 'Sentinel detail';
    error.table = 'patients';
    error.column = 'date_of_birth';
    capture.logger.error({ err: error }, 'failed');

    const err = capture.lines()[0]?.err as Record<string, unknown>;
    expect(err).toMatchObject({
      type: 'DatabaseError',
      code: '22007',
      table: 'patients',
      column: 'date_of_birth',
    });
    expect(err.stack).toMatch(/^DatabaseError 22007\n\s+at /);
    expect(capture.text()).not.toContain('Sentinel');
  });

  it('leaves out lines below the level', () => {
    const capture = captureLogger('info');
    capture.logger.debug({ event: 'db.query' }, 'hidden');
    expect(capture.lines()).toEqual([]);
  });
});
