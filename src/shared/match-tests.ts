// The quick-add box's matching rule (LAB-12): which active tests to offer for
// what the user typed, best first. Pure, so it is unit tested on its own and
// the New order modal only calls it.

type Matchable = { id: string; code: string; name: string; isActive: boolean };

// By code, comparing the characters themselves (codes are A-Z, 0-9 and "-"),
// so the order is the same in every browser and locale.
function byCode(a: Matchable, b: Matchable): number {
  if (a.code === b.code) return 0;
  return a.code < b.code ? -1 : 1;
}

// QUICK-ADD MATCHING: the tests whose code equals the query come first, then
// those whose code starts with it, then those whose name contains it; inside
// each group, by code. A test appears once, in its best group. Case is
// ignored and the query is trimmed; an empty query offers nothing. Inactive
// tests and tests already chosen (selectedIds) are never offered.
export function matchTests<T extends Matchable>(
  query: string,
  tests: readonly T[],
  selectedIds: readonly string[],
): T[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const selected = new Set(selectedIds);
  const exact: T[] = [];
  const prefix: T[] = [];
  const inName: T[] = [];
  for (const test of tests) {
    if (!test.isActive || selected.has(test.id)) continue;
    const code = test.code.toLowerCase();
    if (code === q) exact.push(test);
    else if (code.startsWith(q)) prefix.push(test);
    else if (test.name.toLowerCase().includes(q)) inName.push(test);
  }
  return [
    ...exact.sort(byCode),
    ...prefix.sort(byCode),
    ...inName.sort(byCode),
  ];
}
