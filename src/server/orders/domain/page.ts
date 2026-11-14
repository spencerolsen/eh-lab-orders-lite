// Paging with limit + 1: the caller fetches one row more than the page size.
// Getting that extra row proves there is a next page, without counting every
// matching row; the extra row is dropped.
export function toPage<T>(
  rows: readonly T[],
  limit: number,
): { items: T[]; hasMore: boolean } {
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}
