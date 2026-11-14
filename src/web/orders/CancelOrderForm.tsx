import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { type CancelOrderBody, cancelOrderBody } from '../../shared/orders';

type Field = keyof CancelOrderBody;

const LABELS: Record<Field, string> = {
  note: 'Note',
  cancelledBy: 'Your name',
};

// The cancel form inside the order panel (LAB-17): a note and the name of
// the person cancelling, both required. It checks them with the server's own
// schema before sending, with a message under each field, and hands the
// cleaned values to `onConfirm`; the panel sends the request and shows its
// answer. The server checks them again.
export function CancelOrderForm({
  sending,
  onConfirm,
  onKeep,
}: {
  sending: boolean;
  onConfirm: (body: CancelOrderBody) => void;
  onKeep: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState({ note: '', cancelledBy: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const noteField = useRef<HTMLTextAreaElement>(null);

  // Focus moves to the first field when the form opens.
  useEffect(() => noteField.current?.focus(), []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = cancelOrderBody.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onConfirm(parsed.data);
  }

  function field(name: Field) {
    const inputId = `${id}-${name}`;
    const errorId = `${inputId}-error`;
    const error = errors[name];
    const props = {
      id: inputId,
      name,
      value: values[name],
      onChange: (event: { target: { value: string } }) =>
        setValues((current) => ({ ...current, [name]: event.target.value })),
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? errorId : undefined,
    };
    return (
      <div className="field">
        <label htmlFor={inputId}>{LABELS[name]}</label>
        {name === 'note' ? (
          <textarea ref={noteField} rows={3} {...props} />
        ) : (
          <input {...props} />
        )}
        {error && (
          <p id={errorId} className="field-error">
            {LABELS[name]} {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="form card"
      aria-label="Cancel this order"
      onSubmit={submit}
      noValidate
    >
      {field('note')}
      {field('cancelledBy')}
      <div className="form-actions">
        <button type="submit" className="button-danger" disabled={sending}>
          Confirm cancel
        </button>
        <button type="button" className="button-secondary" onClick={onKeep}>
          Keep order
        </button>
      </div>
    </form>
  );
}
