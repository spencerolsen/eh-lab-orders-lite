import type { z } from 'zod';

import { type FieldProblem, ValidationError } from './errors';

// Runs a Zod schema over a request's input (body, params or query). Returns the
// parsed value, or throws ValidationError listing each field with a short
// reason. Every route calls this explicitly; schemas for request bodies are
// strict objects (z.strictObject), so unknown fields are refused here too.
export function parse<S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const details: FieldProblem[] = result.error.issues.flatMap((issue) => {
    const path = issue.path.map(String);
    // An unknown field is reported once per key, under the key's own name.
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        field: [...path, key].join('.'),
        reason: 'is not an allowed field',
      }));
    }
    return [{ field: path.join('.') || '(input)', reason: issue.message }];
  });
  throw new ValidationError(details);
}
