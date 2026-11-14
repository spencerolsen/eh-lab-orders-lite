import { expect, it } from 'vitest';

import { readFilters, writeFilters } from './filters';

const PATIENT = '5eed0008-0000-4000-8000-000000000002';

it('reads no filters from an address without them', () => {
  expect(readFilters(new URLSearchParams())).toEqual({});
});

it('reads both filters', () => {
  expect(
    readFilters(new URLSearchParams(`status=collected&patientId=${PATIENT}`)),
  ).toEqual({ status: 'collected', patientId: PATIENT });
});

it('ignores a status that is not one of the statuses', () => {
  expect(readFilters(new URLSearchParams('status=bogus'))).toEqual({});
});

it('ignores a patient id that is not a uuid', () => {
  expect(readFilters(new URLSearchParams('patientId=abc'))).toEqual({});
});

it('writes only the filters that are set, leaving other parameters alone', () => {
  const written = writeFilters(new URLSearchParams('order=abc'), {
    status: 'ordered',
  });
  expect(written.toString()).toBe('order=abc&status=ordered');
});

it('removes a filter that is no longer set', () => {
  const written = writeFilters(
    new URLSearchParams(`status=ordered&patientId=${PATIENT}&order=abc`),
    { patientId: PATIENT },
  );
  expect(written.toString()).toBe(`order=abc&patientId=${PATIENT}`);
});

it('writes an empty address for no filters', () => {
  expect(
    writeFilters(new URLSearchParams('status=ordered'), {}).toString(),
  ).toBe('');
});
