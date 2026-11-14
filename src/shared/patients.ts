// The patient rules, defined once: the server parses every request with these
// schemas and the New patient form checks its values with the same ones.
import { z } from 'zod';

import { DATE_PATTERN, isAfterDay, isRealDate } from './dates';
import { normalizePhone, phoneProblem } from './phone';

export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;
// The earliest date of birth accepted, so a typo like 0001-01-01 is caught.
export const EARLIEST_DATE_OF_BIRTH = '1900-01-01';
// The reasons given on email and on phone when neither is present.
export const CONTACT_REQUIRED_REASONS = {
  email: 'is required when there is no phone number',
  phone: 'is required when there is no email',
} as const;

// ' Jane@Example.test ' becomes 'jane@example.test'.
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// Every reason is fixed text and never repeats the value it was given.
const requiredText = z.string({
  error: (issue) =>
    issue.input === undefined ? 'is required' : 'must be text',
});

// Control characters (a NUL, a tab, a line break) are refused: Postgres text
// cannot hold a NUL, and none of them belongs in a name or a search.
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]*$/u;
const CONTROL_CHARACTERS_REASON = 'must not contain control characters';

const nameField = requiredText
  .trim()
  .min(1, 'is required')
  .max(NAME_MAX_LENGTH, `must be ${NAME_MAX_LENGTH} characters or fewer`)
  .regex(NO_CONTROL_CHARACTERS, CONTROL_CHARACTERS_REASON);

// Why a date of birth is not acceptable, or undefined when it is. `today` is
// the clinic's calendar day on the server, and in the browser the latest day
// anywhere (latestTodayAnywhere), 'YYYY-MM-DD'.
export function dateOfBirthProblem(
  value: string,
  today: string,
): string | undefined {
  if (value.trim() === '') return 'is required';
  if (!DATE_PATTERN.test(value)) return 'must be a date written YYYY-MM-DD';
  if (!isRealDate(value)) return 'must be a real calendar date';
  if (isAfterDay(EARLIEST_DATE_OF_BIRTH, value)) {
    return `cannot be before ${EARLIEST_DATE_OF_BIRTH}`;
  }
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

const phoneField = optionalText
  .superRefine((value, ctx) => {
    const reason = value === undefined ? undefined : phoneProblem(value);
    if (reason) ctx.addIssue({ code: 'custom', message: reason });
  })
  .transform((value) => (value === undefined ? value : normalizePhone(value)));

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
// `confirmDuplicate: true` skips the duplicate check (LAB-10): the user saw
// the possible duplicates and chose Create anyway. It is never stored.
export function createPatientBody(today: string) {
  return z
    .strictObject({
      ...patientFields(today),
      confirmDuplicate: z
        .boolean({ error: 'must be true or false' })
        .optional(),
    })
    .superRefine(
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

// The duplicate rules of a new patient (LAB-10), by the fixed names the server
// logs: same email, same phone, or same first name, last name and date of birth.
export const DUPLICATE_RULES = ['email', 'phone', 'name_dob'] as const;
export type DuplicateRule = (typeof DUPLICATE_RULES)[number];

// A 409 POSSIBLE_DUPLICATE lists at most this many matching patients.
export const DUPLICATE_MATCH_LIMIT = 10;

// An email or phone field for an update: absent means "leave it as it is";
// null or empty text means "remove it", and comes out as null.
function clearable<T extends z.ZodType<string | undefined>>(field: T) {
  return field.transform((value) => value ?? null).optional();
}

// The body of PATCH /api/patients/:id: any of the create fields, each checked
// by the same rule as on create. Unknown fields and an empty body are refused.
// The contact rule is not here: whether a patient still has an email or a
// phone depends on the stored row, so the database's patients_contact_required
// check decides it, and the route turns a violation into 422 CONTACT_REQUIRED.
export function updatePatientBody(today: string) {
  const fields = patientFields(today);
  return z
    .strictObject({
      firstName: fields.firstName.optional(),
      lastName: fields.lastName.optional(),
      dateOfBirth: fields.dateOfBirth.optional(),
      email: clearable(fields.email),
      phone: clearable(fields.phone),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'must include at least one field to change',
      // Only when nothing else is wrong: a body with just an unknown field is
      // reported once, for that field.
      when: (payload) => payload.issues.length === 0,
    });
}

export type UpdatePatientBody = z.output<ReturnType<typeof updatePatientBody>>;

// The path of GET and PATCH /api/patients/:id.
export const patientIdParams = z.strictObject({
  id: z.uuid({ error: 'must be a uuid' }),
});

// The search text of GET /api/patients?q=, after trimming, is at most this long.
export const SEARCH_MAX_LENGTH = 100;
// A search returns at most this many patients (the list has no paging); the
// Patients page says so when a search reaches it.
export const SEARCH_RESULT_LIMIT = 50;

// The query string of GET /api/patients. `q` is trimmed; missing or empty
// means "every patient". Unknown parameters are refused.
export const patientListQuery = z.strictObject({
  q: z
    .string({ error: 'must be text' })
    .trim()
    .max(SEARCH_MAX_LENGTH, `must be ${SEARCH_MAX_LENGTH} characters or fewer`)
    .regex(NO_CONTROL_CHARACTERS, CONTROL_CHARACTERS_REASON)
    .optional(),
});

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
