// The lab test request and response schemas (docs/api.md), used by the server
// to check what it receives and by the web app to check what it sends and
// gets back.
import { z } from 'zod';

// The largest value a Postgres `integer` column holds.
const MAX_INTEGER = 2_147_483_647;

// The longest turnaround a test may have, in business days. A cap keeps the
// ready-date arithmetic (LAB-11) on sane numbers; the database checks it too.
export const MAX_TURNAROUND_DAYS = 365;

// Each message says what a valid value looks like. The API returns it as the
// field's reason, and the form shows it under the field.
export const LAB_TEST_MESSAGES = {
  code: 'Use 2 to 20 letters, digits or hyphens',
  name: 'Enter a name of 1 to 100 characters',
  priceCents: 'Must be a whole number of cents, 0 or more',
  turnaroundDays: 'Enter a whole number of business days from 1 to 365',
  tooLarge: 'Too large',
} as const;

const m = LAB_TEST_MESSAGES;

// The code is trimmed and upper-cased before it is checked, so "cbc" and
// " CBC " are both CBC. The database stores codes upper case only, which makes
// its unique constraint case-insensitive.
const code = z
  .string({ error: m.code })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,20}$/, { error: m.code });

const name = z
  .string({ error: m.name })
  .trim()
  .min(1, { error: m.name })
  .max(100, { error: m.name });

const priceCents = z
  .number({ error: m.priceCents })
  .int({ error: m.priceCents })
  .min(0, { error: m.priceCents })
  .max(MAX_INTEGER, { error: m.tooLarge });

const turnaroundDays = z
  .number({ error: m.turnaroundDays })
  .int({ error: m.turnaroundDays })
  .min(1, { error: m.turnaroundDays })
  .max(MAX_TURNAROUND_DAYS, { error: m.turnaroundDays });

// POST /api/lab-tests. Strict: an unknown field is a 400. A new test is always
// active, so isActive is not accepted here.
export const createLabTestBody = z.strictObject({
  code,
  name,
  priceCents,
  turnaroundDays,
});

export type CreateLabTestBody = z.output<typeof createLabTestBody>;

// One lab test as the API returns it.
export const labTestSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  priceCents: z.number().int(),
  turnaroundDays: z.number().int(),
  isActive: z.boolean(),
});

export const labTestListSchema = z.array(labTestSchema);

export type LabTest = z.infer<typeof labTestSchema>;
