// Text for a LIKE or ILIKE pattern that matches `value` literally. A
// backslash, % and _ are pattern characters, so each gets a backslash in
// front; the query must say `escape '\'`. The result is still passed as a
// bound parameter, never written into the SQL.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
