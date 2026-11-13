import { describe, expect, it } from 'vitest';

import { assertResettable, databaseName, testDatabaseUrl } from './guards';

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
  });

  it.each(['postgres', 'not_lab_orders_prod', 'lab_orders_copy', 'other_test'])(
    'refuses the database %s',
    (name) => {
      expect(() => assertResettable(url(name), undefined)).toThrow(
        /only lab_orders and lab_orders_test can be reset/,
      );
    },
  );

  it('refuses when NODE_ENV is production', () => {
    expect(() => assertResettable(url('lab_orders'), 'production')).toThrow(
      /production/,
    );
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
