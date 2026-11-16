// The catalog search rule (LAB-27). Pure, so it is unit tested on its own and
// the Lab tests page only calls it.

type Searchable = { code: string; name: string };

// A test matches when the text, trimmed, appears anywhere in its code or its
// name, ignoring case. An empty (or all-space) text matches every test. The
// text is compared as plain text with `includes`, never turned into a
// pattern, so "(", "." or "[" mean themselves. Active and inactive tests are
// treated alike; the order of the list is kept.
export function searchLabTests<T extends Searchable>(
  text: string,
  tests: readonly T[],
): T[] {
  const q = text.trim().toLowerCase();
  if (q === '') return [...tests];
  return tests.filter(
    (test) =>
      test.code.toLowerCase().includes(q) ||
      test.name.toLowerCase().includes(q),
  );
}
