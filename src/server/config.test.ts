import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadConfig, parseConfig } from './config';

const validUrl = 'postgres://lab_orders:lab_orders@localhost:5433/lab_orders';

function problemsFor(env: Record<string, string | undefined>) {
  const result = parseConfig(env);
  if (result.ok) throw new Error('expected the config to be invalid');
  return result.problems;
}

describe('parseConfig', () => {
  it('gives the typed, frozen object with defaults from a valid env', () => {
    const result = parseConfig({ DATABASE_URL: validUrl });
    expect(result).toEqual({
      ok: true,
      config: {
        DATABASE_URL: validUrl,
        PORT: 3000,
        LOG_LEVEL: 'info',
        CLINIC_TIMEZONE: 'America/Denver',
      },
    });
    if (result.ok) expect(Object.isFrozen(result.config)).toBe(true);
  });

  it('reads every setting when given', () => {
    const result = parseConfig({
      DATABASE_URL: validUrl,
      PORT: '8080',
      LOG_LEVEL: 'debug',
      CLINIC_TIMEZONE: 'Pacific/Auckland',
    });
    expect(result.ok && result.config).toMatchObject({
      PORT: 8080,
      LOG_LEVEL: 'debug',
      CLINIC_TIMEZONE: 'Pacific/Auckland',
    });
  });

  it.each([
    ['DATABASE_URL', { DATABASE_URL: undefined }],
    ['DATABASE_URL', { DATABASE_URL: 'mysql://localhost/lab_orders' }],
    ['PORT', { PORT: 'abc' }],
    ['PORT', { PORT: '70000' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'verbose' }],
    ['CLINIC_TIMEZONE', { CLINIC_TIMEZONE: 'Mars/Base' }],
  ])('reports an invalid %s by name', (setting, overrides) => {
    const problems = problemsFor({ DATABASE_URL: validUrl, ...overrides });
    expect(problems.map((problem) => problem.setting)).toEqual([setting]);
  });

  it('reports several problems together', () => {
    const problems = problemsFor({ PORT: 'abc', CLINIC_TIMEZONE: 'Mars/Base' });
    expect(problems.map((problem) => problem.setting).sort()).toEqual([
      'CLINIC_TIMEZONE',
      'DATABASE_URL',
      'PORT',
    ]);
  });
});

describe('loadConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes one JSON error line without the password and exits with code 1', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    expect(() =>
      loadConfig({
        DATABASE_URL: 'mysql://admin:s3cret-pw@localhost/lab_orders',
        PORT: 'abc',
      }),
    ).toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0]?.[0]);
    expect(line).not.toContain('s3cret-pw');
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({
      level: 'error',
      event: 'config.invalid',
      problems: [
        {
          setting: 'DATABASE_URL',
          reason: 'must be a valid postgres:// or postgresql:// URL',
        },
        { setting: 'PORT', reason: 'must be a whole number' },
      ],
    });
  });
});
