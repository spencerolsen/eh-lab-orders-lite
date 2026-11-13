import { type FormEvent, type ReactNode, useId, useState } from 'react';

import type { FieldProblem } from '../../shared/api-error';
import { latestTodayAnywhere } from '../../shared/dates';
import {
  CONTACT_REQUIRED_REASONS,
  type CreatePatientBody,
  createPatientBody,
} from '../../shared/patients';
import { ApiError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';

// What the user types, field by field, as text.
export type PatientFormValues = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
};

type Field = keyof PatientFormValues;
type FieldErrors = Partial<Record<Field, string>>;

export const EMPTY_PATIENT: PatientFormValues = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  email: '',
  phone: '',
};

const FIELDS: { name: Field; label: string; type: string; help?: string }[] = [
  { name: 'firstName', label: 'First name', type: 'text' },
  { name: 'lastName', label: 'Last name', type: 'text' },
  {
    name: 'dateOfBirth',
    label: 'Date of birth',
    type: 'text',
    help: 'Year-month-day, for example 1984-03-09.',
  },
  {
    name: 'email',
    label: 'Email',
    type: 'email',
    help: 'An email or a phone number is required.',
  },
  {
    name: 'phone',
    label: 'Phone',
    type: 'tel',
    help: 'A US number with its area code, for example (801) 555-0101.',
  },
];

function isField(name: unknown): name is Field {
  return FIELDS.some((field) => field.name === name);
}

// One message per field (the first), in the slot of the field it names. The
// browser's check and a 400 from the server both arrive as { field, reason }.
function toFieldErrors(problems: FieldProblem[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const { field, reason } of problems) {
    if (isField(field) && errors[field] === undefined) errors[field] = reason;
  }
  return errors;
}

// The patient form, for a new patient here and for editing one in LAB-09.
// It checks the values with the same shared schema the server uses, shows
// each problem under its field, and clears it when that field is edited.
// `onSubmit` gets the parsed values; if it throws, a 400's field problems go
// under their fields and the message (with its reference) above the button.
// `secondaryAction` (a Cancel link, say) sits next to the submit button.
export function PatientForm({
  initialValues = EMPTY_PATIENT,
  submitLabel,
  onSubmit,
  secondaryAction,
}: {
  initialValues?: PatientFormValues;
  submitLabel: string;
  onSubmit: (body: CreatePatientBody) => Promise<unknown>;
  secondaryAction?: ReactNode;
}) {
  const id = useId();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  function change(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current, [field]: undefined };
      // Typing an email answers the "email or phone" error on phone too.
      if (field === 'email' && next.phone === CONTACT_REQUIRED_REASONS.phone) {
        next.phone = undefined;
      }
      if (field === 'phone' && next.email === CONTACT_REQUIRED_REASONS.email) {
        next.email = undefined;
      }
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    // The browser's "not in the future" check is advisory: it uses the latest
    // day anywhere, so it never blocks a date the server (clinic time) accepts.
    const parsed = createPatientBody(latestTodayAnywhere(new Date())).safeParse(
      values,
    );
    if (!parsed.success) {
      setErrors(
        toFieldErrors(
          parsed.error.issues.map((issue) => ({
            field: String(issue.path[0]),
            reason: issue.message,
          })),
        ),
      );
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSubmit(parsed.data);
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        setErrors(toFieldErrors(error.details));
      }
      setSubmitError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="form card"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      {FIELDS.map(({ name, label, type, help }) => {
        const inputId = `${id}-${name}`;
        const helpId = `${inputId}-help`;
        const errorId = `${inputId}-error`;
        const error = errors[name];
        const describedBy = [help && helpId, error && errorId]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={name} className="field">
            <label htmlFor={inputId}>{label}</label>
            <input
              id={inputId}
              name={name}
              type={type}
              value={values[name]}
              onChange={(event) => change(name, event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
            />
            {help && (
              <p id={helpId} className="field-help">
                {help}
              </p>
            )}
            {error && (
              <p id={errorId} className="field-error">
                {label} {error}
              </p>
            )}
          </div>
        );
      })}
      {submitError !== null && <ErrorMessage error={submitError} />}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {secondaryAction}
      </div>
    </form>
  );
}
