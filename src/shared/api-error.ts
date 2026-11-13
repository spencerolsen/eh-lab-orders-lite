import { z } from 'zod';

// The standard error body every API failure has (docs/api.md). The server
// builds it (toErrorResponse in src/server/errors.ts); the web client checks a
// failed response against it (src/web/api/client.ts), so both sides agree on
// one shape.

// One problem with one field of the input, for example
// { field: 'priceCents', reason: 'must be at least 0' }.
export const fieldProblemSchema = z.object({
  field: z.string(),
  reason: z.string(),
});

export const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(fieldProblemSchema).optional(),
    requestId: z.string(),
  }),
});

export type FieldProblem = z.infer<typeof fieldProblemSchema>;
export type ErrorBody = z.infer<typeof errorBodySchema>;
