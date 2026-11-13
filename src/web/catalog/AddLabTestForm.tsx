import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

import {
  type CreateLabTestBody,
  createLabTestBody,
  MAX_TURNAROUND_DAYS,
} from '../../shared/lab-tests';
import { parseDollarsToCents } from '../../shared/money';
import { ApiError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { createLabTest, LAB_TESTS_KEY } from './api';

// The fields, named as in the API body, so a 400's details land on the right
// field.
type Field = keyof CreateLabTestBody;
type FieldErrors = Partial<Record<Field, string>>;
type Values = { code: string; name: string; price: string; turnaround: string };

const EMPTY: Values = { code: '', name: '', price: '', turnaround: '' };
const FIELDS: Field[] = ['code', 'name', 'priceCents', 'turnaroundDays'];
export const PRICE_MESSAGE = 'Enter a price in dollars, like 12.50';

// Checks what was typed with the same schema the server uses. Returns the body
// to send, or the message to show under each field that is wrong.
function validate(values: Values): {
  body?: CreateLabTestBody;
  errors: FieldErrors;
} {
  const cents = parseDollarsToCents(values.price);
  const days = values.turnaround.trim();
  const result = createLabTestBody.safeParse({
    code: values.code,
    name: values.name,
    priceCents: cents ?? Number.NaN,
    turnaroundDays: /^\d+$/.test(days) ? Number(days) : Number.NaN,
  });
  const errors: FieldErrors = {};
  for (const issue of result.error?.issues ?? []) {
    const field = issue.path[0] as Field;
    errors[field] ??= issue.message;
  }
  // The schema checks cents; what the user typed was dollars.
  if (cents === null) errors.priceCents = PRICE_MESSAGE;
  return result.success ? { body: result.data, errors } : { errors };
}

// The field errors in a failed request: the duplicate code (409) or a 400's
// details. Anything else is shown above the button instead.
function fieldErrorsFrom(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) return {};
  if (error.code === 'DUPLICATE_TEST_CODE') return { code: error.message };
  const errors: FieldErrors = {};
  for (const { field, reason } of error.details ?? []) {
    if ((FIELDS as string[]).includes(field)) errors[field as Field] ??= reason;
  }
  return errors;
}

export function AddLabTestForm() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useMutation({
    mutationFn: createLabTest,
    onSuccess: async () => {
      setValues(EMPTY);
      await queryClient.invalidateQueries({ queryKey: LAB_TESTS_KEY });
    },
  });

  const serverErrors = fieldErrorsFrom(mutation.error);
  const shown = Object.keys(errors).length > 0 ? errors : serverErrors;
  const otherError = mutation.isError && Object.keys(serverErrors).length === 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { body, errors: found } = validate(values);
    setErrors(found);
    if (body) mutation.mutate(body);
    else mutation.reset();
  }

  // Empties the form and removes every message.
  function clear() {
    setValues(EMPTY);
    setErrors({});
    mutation.reset();
  }

  function change(key: keyof Values) {
    return (text: string) => setValues((old) => ({ ...old, [key]: text }));
  }

  return (
    <form className="form card" onSubmit={onSubmit} noValidate>
      <TextField
        id="lab-test-code"
        label="Code"
        help="2 to 20 letters, digits or hyphens; saved in capitals."
        value={values.code}
        onChange={change('code')}
        error={shown.code}
      />
      <TextField
        id="lab-test-name"
        label="Name"
        value={values.name}
        onChange={change('name')}
        error={shown.name}
      />
      <TextField
        id="lab-test-price"
        label="Price (dollars)"
        help="For example 12.50. Use 0 for a free test."
        inputMode="decimal"
        value={values.price}
        onChange={change('price')}
        error={shown.priceCents}
      />
      <TextField
        id="lab-test-turnaround"
        label="Turnaround (business days)"
        help={`A whole number from 1 to ${MAX_TURNAROUND_DAYS}.`}
        inputMode="numeric"
        value={values.turnaround}
        onChange={change('turnaround')}
        error={shown.turnaroundDays}
      />
      {otherError && <ErrorMessage error={mutation.error} />}
      <div className="form-actions">
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Adding…' : 'Add lab test'}
        </button>
        <button type="button" className="button-secondary" onClick={clear}>
          Clear
        </button>
      </div>
    </form>
  );
}

// A labelled text input with optional help text and its error, if any, under
// it (the theme's field markup, AGENTS.md "Styling a page"). Help and error
// are the input's accessible description, so a screen reader reads them with
// the field.
function TextField({
  id,
  label,
  help,
  value,
  onChange,
  error,
  inputMode,
}: {
  id: string;
  label: string;
  help?: string;
  value: string;
  onChange: (text: string) => void;
  error: string | undefined;
  inputMode?: 'decimal' | 'numeric';
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [help && helpId, error && errorId]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
          {error}
        </p>
      )}
    </div>
  );
}
