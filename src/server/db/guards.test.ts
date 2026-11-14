import { describe, expect, it } from 'vitest';

import {
  assertResettable,
  checkDatabasePort,
  databaseName,
  e2eDatabaseUrl,
  testDatabaseUrl,
} from './guards';

const url = (name: string) =>
  `postgres://lab_orders:lab_orders@localhost:5433/${name}`;

describe('databaseName', () => {
  it('reads the database name from the URL path', () => {
    expect(databaseName(url('lab_orders_test'))).toBe('lab_orders_test');
  });
});

describe('assertResettable', () => {
  it('allows the project databases', () => {
    expect(() =>
      assertResettable(url('lab_orders'), 'development'),
    ).not.toThrow();
    expect(() =>
      assertResettable(url('lab_orders_test'), undefined),
    ).not.toThrow();
    expect(() =>
      assertResettable(url('lab_orders_e2e'), undefined),
    ).not.toThrow();
  });

  it.each(['postgres', 'not_lab_orders_prod', 'lab_orders_copy', 'other_test'])(
    'refuses the database %s',
    (name) => {
      expect(() => assertResettable(url(name), undefined)).toThrow(
        /only lab_orders, lab_orders_test and lab_orders_e2e can be reset/,
      );
    },
  );

  it('refuses when NODE_ENV is production', () => {
    expect(() => assertResettable(url('lab_orders'), 'production')).toThrow(
      /production/,
    );
  });
});

describe('e2eDatabaseUrl', () => {
  it('keeps the server and login of DATABASE_URL and names the e2e database', () => {
    const e2e = e2eDatabaseUrl({ DATABASE_URL: url('lab_orders') });
    expect(e2e).toBe(url('lab_orders_e2e'));
    expect(databaseName(e2e)).toBe('lab_orders_e2e');
  });

  it('never takes the name from the setting, whatever it says', () => {
    expect(
      databaseName(e2eDatabaseUrl({ DATABASE_URL: url('some_other_db') })),
    ).toBe('lab_orders_e2e');
  });

  it('stops when DATABASE_URL is missing', () => {
    expect(() => e2eDatabaseUrl({})).toThrow(/DATABASE_URL is not set/);
  });
});

describe('testDatabaseUrl', () => {
  it('returns a URL whose database name ends in _test', () => {
    expect(testDatabaseUrl({ TEST_DATABASE_URL: url('lab_orders_test') })).toBe(
      url('lab_orders_test'),
    );
  });

  it('refuses a missing setting', () => {
    expect(() => testDatabaseUrl({})).toThrow(/not set/);
  });

  it('refuses a database whose name does not end in _test', () => {
    expect(() =>
      testDatabaseUrl({ TEST_DATABASE_URL: url('lab_orders') }),
    ).toThrow(/_test/);
  });
});

describe('checkDatabasePort', () => {
  const at = (port: string, host = 'localhost') =>
    `postgres://lab_orders:lab_orders@${host}:${port}/lab_orders`;

  it('accepts the defaults: both URLs on 5433 and no DB_PORT', () => {
    expect(() =>
      checkDatabasePort({
        DATABASE_URL: at('5433'),
        TEST_DATABASE_URL: at('5433'),
      }),
    ).not.toThrow();
  });

  it('accepts a second copy with DB_PORT and both URLs changed', () => {
    expect(() =>
      checkDatabasePort({
        COMPOSE_PROJECT_NAME: 'lab-orders-lite-2',
        DB_PORT: '5434',
        DATABASE_URL: at('5434'),
        TEST_DATABASE_URL: at('5434', '127.0.0.1'),
      }),
    ).not.toThrow();
  });

  it.each([
    ['no', undefined],
    ['an empty', ''],
    ['the default', 'lab-orders-lite'],
  ])(
    'refuses a changed DB_PORT with %s project name, which would take over the first copy',
    (_, name) => {
      expect(() =>
        checkDatabasePort({
          COMPOSE_PROJECT_NAME: name,
          DB_PORT: '5434',
          DATABASE_URL: at('5434'),
          TEST_DATABASE_URL: at('5434'),
        }),
      ).toThrow(
        'DB_PORT is 5434, but COMPOSE_PROJECT_NAME is still lab-orders-lite (or empty)',
      );
    },
  );

  it('names the URL whose port differs from DB_PORT', () => {
    expect(() =>
      checkDatabasePort({
        COMPOSE_PROJECT_NAME: 'lab-orders-lite-2',
        DB_PORT: '5434',
        DATABASE_URL: at('5434'),
        TEST_DATABASE_URL: at('5433'),
      }),
    ).toThrow(
      'TEST_DATABASE_URL uses port 5433, but the database container listens on DB_PORT 5434',
    );
  });

  it('treats a local URL with no port as port 5432', () => {
    expect(() =>
      checkDatabasePort({
        DATABASE_URL: 'postgres://lab_orders:lab_orders@localhost/lab_orders',
      }),
    ).toThrow('DATABASE_URL uses port 5432');
  });

  it('leaves a URL on another host alone', () => {
    expect(() =>
      checkDatabasePort({ DATABASE_URL: at('5432', 'db.example.test') }),
    ).not.toThrow();
  });
});
