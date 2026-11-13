// The patient rules, defined once: the server parses every request with these
// schemas and the New patient form checks its values with the same ones.
import { z } from 'zod';

import { DATE_PATTERN, isAfterDay, isRealDate } from './dates';

export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;
// A phone number is stored as digits only. 7 digits is a local number without
// an area code; 15 is the longest number the international standard (E.164)
// allows. International formats (a leading +) are a future version.
export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15;

// The reasons given on email and on phone when neither is present.
export const CONTACT_REQUIRED_REASONS = {
  email: 'is required when there is no phone number',
  phone: 'is required when there is no email',
} as const;

// '(801) 555-0100' becomes '8015550100'.
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

// ' Jane@Example.test ' becomes 'jane@example.test'.
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// Every reason is fixed text and never repeats the value it was given.
const requiredText = z.string({
  error: (issue) =>
    issue.input === undefined ? 'is required' : 'must be text',
});

const nameField = requiredText
  .trim()
  .min(1, 'is required')
  .max(NAME_MAX_LENGTH, `must be ${NAME_MAX_LENGTH} characters or fewer`);

// Why a date of birth is not acceptable, or undefined when it is. `today` is
// the clinic's (or, in the browser, the user's) calendar day, 'YYYY-MM-DD'.
export function dateOfBirthProblem(
  value: string,
  today: string,
): string | undefined {
  if (value.trim() === '') return 'is required';
  if (!DATE_PATTERN.test(value)) return 'must be a date written YYYY-MM-DD';
  if (!isRealDate(value)) return 'must be a real calendar date';
  if (isAfterDay(value, today)) return 'cannot be in the future';
  return undefined;
}

function dateOfBirthField(today: string) {
  return requiredText.superRefine((value, ctx) => {
    const reason = dateOfBirthProblem(value, today);
    if (reason) ctx.addIssue({ code: 'custom', message: reason });
  });
}

// Email and phone: empty text, null or no field at all means "not given".
const optionalText = z
  .string({ error: 'must be text' })
  .nullish()
  .transform((value) =>
    value == null || value.trim() === '' ? undefined : value,
  );

const emailField = optionalText
  .transform((value) => (value === undefined ? value : normalizeEmail(value)))
  .pipe(
    z
      .email({ error: 'must be an email address' })
      .max(EMAIL_MAX_LENGTH, `must be ${EMAIL_MAX_LENGTH} characters or fewer`)
      .optional(),
  );

const phoneDigits = new RegExp(
  `^\\d{${PHONE_MIN_DIGITS},${PHONE_MAX_DIGITS}}$`,
);

const phoneField = optionalText
  .transform((value) => (value === undefined ? value : normalizePhone(value)))
  .pipe(
    z
      .string()
      .regex(
        phoneDigits,
        `must have ${PHONE_MIN_DIGITS} to ${PHONE_MAX_DIGITS} digits`,
      )
      .optional(),
  );

// The fields of a new patient. A factory, because "not in the future" needs
// today's date: the server calls it with today(CLINIC_TIMEZONE, clock()).
export function patientFields(today: string) {
  return {
    firstName: nameField,
    lastName: nameField,
    dateOfBirth: dateOfBirthField(today),
    email: emailField,
    phone: phoneField,
  };
}

// The body of POST /api/patients. Unknown fields are refused. The contact
// rule runs even when other fields are wrong, so the form shows every problem
// at once; it reports on both email and phone.
export function createPatientBody(today: string) {
  return z.strictObject(patientFields(today)).superRefine(
    (value, ctx) => {
      if (value.email !== undefined || value.phone !== undefined) return;
      for (const field of ['email', 'phone'] as const) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: CONTACT_REQUIRED_REASONS[field],
        });
      }
    },
    // Zod skips an object's refinements when a field already failed; this
    // one only needs email and phone, which are parsed by then, so it runs.
    { when: () => true },
  );
}

export type CreatePatientBody = z.output<ReturnType<typeof createPatientBody>>;

// A patient as the API returns it. Email and phone are null when absent.
export const patientSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export const patientListSchema = z.array(patientSchema);

export type Patient = z.infer<typeof patientSchema>;
