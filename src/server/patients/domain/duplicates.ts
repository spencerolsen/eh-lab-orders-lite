// The duplicate-patient rule (LAB-10), as a pure function: no database, no
// framework. The repository's candidate query finds the same rows in SQL;
// this function decides, row by row, which rules matched.
import type { DuplicateRule } from '../../../shared/patients';

// What the rule reads from a patient, new or stored. An absent email or phone
// is undefined (a parsed body) or null (a stored row).
export type DuplicateFields = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email?: string | null;
  phone?: string | null;
};

// Trimmed and lower-cased; empty text counts as absent.
function folded(value: string | null | undefined): string | undefined {
  const text = value?.trim().toLowerCase();
  return text ? text : undefined;
}

// The rule: an existing patient is a likely duplicate of a new one if ANY one
// of these holds, each an exact comparison that ignores letter case and
// surrounding spaces (never fuzzy: an accent or one letter more is a
// different value):
// - email: the same email. A missing email never matches a missing one.
// - phone: the same phone, as the stored 10 digits (the schema has already
//   turned '(801) 555-0100' into '8015550100'). A missing phone never matches.
// - name_dob: the same first name AND last name AND date of birth. A last
//   name alone, or a name with another date of birth, is not a match.
// Returns the rules that matched, in DUPLICATE_RULES order; empty means not a
// duplicate. The caller only warns: two real people can share all of these.
export function matchRules(
  candidate: DuplicateFields,
  existing: DuplicateFields,
): DuplicateRule[] {
  const rules: DuplicateRule[] = [];
  const email = folded(candidate.email);
  if (email !== undefined && email === folded(existing.email)) {
    rules.push('email');
  }
  const phone = folded(candidate.phone);
  if (phone !== undefined && phone === folded(existing.phone)) {
    rules.push('phone');
  }
  const firstName = folded(candidate.firstName);
  const lastName = folded(candidate.lastName);
  if (
    firstName !== undefined &&
    lastName !== undefined &&
    firstName === folded(existing.firstName) &&
    lastName === folded(existing.lastName) &&
    candidate.dateOfBirth === existing.dateOfBirth
  ) {
    rules.push('name_dob');
  }
  return rules;
}
