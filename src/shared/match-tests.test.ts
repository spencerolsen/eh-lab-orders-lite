import { describe, expect, it } from 'vitest';

import { matchTests } from './match-tests';

let nextId = 0;
const test = (code: string, name: string, isActive = true) => ({
  id: `t${(nextId += 1)}`,
  code,
  name,
  isActive,
});

const CBC = test('CBC', 'Complete Blood Count');
const CBCD = test('CBC-DIFF', 'CBC with differential');
const CBC2 = test('CBC2', 'Second blood count');
const LIPID = test('LIPID', 'Lipid Panel');
const A1C = test('A1C', 'Hemoglobin A1c');
const XCBC = test('XCBC', 'Extended cbc screen');
const ACBC = test('ACBC', 'Another cbc screen');
const CATALOG = [XCBC, LIPID, CBC2, A1C, CBCD, ACBC, CBC];

const codes = (query: string, selectedIds: string[] = [], tests = CATALOG) =>
  matchTests(query, tests, selectedIds).map((t) => t.code);

describe('matchTests', () => {
  it('offers LIPID for "li"', () => {
    expect(codes('li')).toEqual(['LIPID']);
  });

  it('puts the exact code first, then code prefixes, then names that contain the query', () => {
    expect(codes('cbc')).toEqual(['CBC', 'CBC-DIFF', 'CBC2', 'ACBC', 'XCBC']);
  });

  it('orders by code inside each group, whatever order the catalog is in', () => {
    expect(codes('cbc', [], [...CATALOG].reverse())).toEqual(codes('cbc'));
    expect(codes('screen')).toEqual(['ACBC', 'XCBC']);
  });

  it('ignores case in the query, the code and the name', () => {
    expect(codes('CBC')).toEqual(codes('cbc'));
    expect(codes('cBc')).toEqual(codes('cbc'));
    expect(codes('HEMOGLOBIN')).toEqual(['A1C']);
  });

  it('trims the query', () => {
    expect(codes('  li  ')).toEqual(['LIPID']);
  });

  it('offers nothing for an empty or blank query', () => {
    expect(codes('')).toEqual([]);
    expect(codes('   ')).toEqual([]);
  });

  it('offers nothing when nothing matches', () => {
    expect(codes('zzz')).toEqual([]);
  });

  it('never offers an inactive test, even on an exact code', () => {
    const old = test('OLD', 'Old panel', false);
    expect(codes('old', [], [old, LIPID])).toEqual([]);
    expect(codes('panel', [], [old, LIPID])).toEqual(['LIPID']);
  });

  it('never offers a test already chosen', () => {
    expect(codes('cbc', [CBC.id, XCBC.id])).toEqual([
      'CBC-DIFF',
      'CBC2',
      'ACBC',
    ]);
  });

  it('lists a test once, in its best group, when its code and name both match', () => {
    // CBC-DIFF's code starts with "cbc" and its name contains "cbc".
    const found = codes('cbc');
    expect(found.filter((code) => code === 'CBC-DIFF')).toHaveLength(1);
    expect(found.indexOf('CBC-DIFF')).toBeLessThan(found.indexOf('ACBC'));
  });

  it('matches a code inside a name only through the name, not a code that merely contains it', () => {
    // "IPI" is inside the code LIPID and the name "Lipid Panel".
    expect(codes('ipi')).toEqual(['LIPID']);
    // "1C" is inside the code A1C and the name "Hemoglobin A1c".
    expect(codes('1c')).toEqual(['A1C']);
    expect(codes('2')).toEqual([]);
  });

  it('does not change the catalog it is given', () => {
    const catalog = [...CATALOG];
    matchTests('cbc', catalog, []);
    expect(catalog).toEqual(CATALOG);
  });
});
