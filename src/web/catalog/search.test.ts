import { describe, expect, it } from 'vitest';

import { searchLabTests } from './search';

const tests = [
  { code: 'CBC', name: 'Complete Blood Count', isActive: true },
  { code: 'TSH', name: 'Thyroid Stimulating Hormone', isActive: false },
  { code: 'VIT-D', name: 'Vitamin D (25-OH)', isActive: true },
  { code: 'A1C', name: 'Hemoglobin A1c', isActive: true },
  { code: 'PSA', name: 'Prostate-specific antigen. Total', isActive: true },
];
const codes = (found: { code: string }[]) => found.map((t) => t.code);

describe('searchLabTests', () => {
  it('matches text anywhere in the code', () => {
    expect(codes(searchLabTests('BC', tests))).toEqual(['CBC']);
    expect(codes(searchLabTests('1C', tests))).toEqual(['A1C']);
  });

  it('matches text anywhere in the name', () => {
    expect(codes(searchLabTests('blood', tests))).toEqual(['CBC']);
    expect(codes(searchLabTests('stimulating', tests))).toEqual(['TSH']);
  });

  it('matches a code or a name, each test once, in list order', () => {
    // "c" is in CBC's code and name, and in the names of others.
    expect(codes(searchLabTests('c', tests))).toEqual(['CBC', 'A1C', 'PSA']);
  });

  it('ignores case on both sides', () => {
    expect(codes(searchLabTests('cbc', tests))).toEqual(['CBC']);
    expect(codes(searchLabTests('THYROID', tests))).toEqual(['TSH']);
    expect(codes(searchLabTests('a1C', tests))).toEqual(['A1C']);
  });

  it('ignores spaces at the start and end but not inside', () => {
    expect(codes(searchLabTests('  cbc ', tests))).toEqual(['CBC']);
    expect(codes(searchLabTests('complete blood', tests))).toEqual(['CBC']);
    expect(codes(searchLabTests('complete   blood', tests))).toEqual([]);
  });

  it('shows every test, in order, for an empty or all-space text', () => {
    expect(searchLabTests('', tests)).toEqual(tests);
    expect(searchLabTests('   ', tests)).toEqual(tests);
  });

  it('searches inactive tests like active ones', () => {
    expect(codes(searchLabTests('tsh', tests))).toEqual(['TSH']);
  });

  it('treats special characters as plain text', () => {
    expect(codes(searchLabTests('(25', tests))).toEqual(['VIT-D']);
    expect(codes(searchLabTests('(25-OH)', tests))).toEqual(['VIT-D']);
    // As a pattern "." would match everything; as text only one name has it.
    expect(codes(searchLabTests('.', tests))).toEqual(['PSA']);
    expect(searchLabTests('.*', tests)).toEqual([]);
    expect(searchLabTests('[', tests)).toEqual([]);
    expect(searchLabTests('+', tests)).toEqual([]);
    expect(searchLabTests('?', tests)).toEqual([]);
    expect(searchLabTests('a|b', tests)).toEqual([]);
    expect(searchLabTests('\\', tests)).toEqual([]);
  });

  it('returns nothing when no test matches, and never changes its input', () => {
    const before = structuredClone(tests);
    expect(searchLabTests('zzz', tests)).toEqual([]);
    expect(tests).toEqual(before);
  });
});
