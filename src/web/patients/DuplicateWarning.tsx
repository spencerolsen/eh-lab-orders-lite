import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router';

import { formatPhone } from '../../shared/phone';
import type { Patient } from '../../shared/patients';
import { ErrorMessage } from '../components/ErrorMessage';
import { PatientLabel } from './PatientLabel';

// The warning above the New patient form when the server answered 409
// POSSIBLE_DUPLICATE (LAB-10): the existing patients that match, each with
// name, date of birth, email and phone and a link to open it, and Create
// anyway, the secondary way out, which adds the new patient regardless.
// It is announced (role="alert") and takes focus when it appears, so a
// keyboard or screen reader user lands on it.
export function DuplicateWarning({
  matches,
  creating,
  error,
  onCreateAnyway,
}: {
  matches: Patient[];
  // Create anyway is running.
  creating: boolean;
  // Why Create anyway failed, or null.
  error: unknown;
  onCreateAnyway: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <section
      ref={panel}
      className="card stack"
      role="alert"
      aria-labelledby={`${id}-heading`}
      tabIndex={-1}
    >
      <h2 id={`${id}-heading`}>This patient may already exist</h2>
      <p>
        {matches.length === 1
          ? 'An existing patient has'
          : `${matches.length} existing patients have`}{' '}
        the same email, the same phone, or the same name and date of birth. Open
        the patient instead if it is the same person.
      </p>
      <ul className="stack">
        {matches.map((match) => (
          <li key={match.id}>
            <p>
              <strong id={`${id}-${match.id}`}>
                <PatientLabel patient={match} />
              </strong>
            </p>
            <p className="muted">
              Email: {match.email ?? 'none'} · Phone:{' '}
              {match.phone === null ? 'none' : formatPhone(match.phone)}
            </p>
            <Link
              to={`/patients/${encodeURIComponent(match.id)}`}
              aria-describedby={`${id}-${match.id}`}
            >
              Open this patient
            </Link>
          </li>
        ))}
      </ul>
      <p>
        Create anyway adds a second patient record, even if this is the same
        person.
      </p>
      {error !== null && <ErrorMessage error={error} />}
      <div className="form-actions">
        <button
          type="button"
          className="button-secondary"
          disabled={creating}
          onClick={onCreateAnyway}
        >
          {creating ? 'Creating…' : 'Create anyway'}
        </button>
      </div>
    </section>
  );
}
