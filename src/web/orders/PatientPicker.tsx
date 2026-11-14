import { useState } from 'react';

import type { Patient } from '../../shared/patients';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PatientLabel } from '../patients/PatientLabel';
import {
  useDebouncedValue,
  usePatientSearch,
} from '../patients/usePatientSearch';

// Step one of the New order modal: find the patient by name (the patient
// search of the Patients page, LAB-09) and pick one. Once picked, the
// patient is shown with name and date of birth and a Change button.
export function PatientPicker({
  patient,
  onChange,
}: {
  patient: Patient | null;
  onChange: (patient: Patient | null) => void;
}) {
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim());

  if (patient) {
    return (
      <div className="field">
        <span className="field-label">Patient</span>
        <div className="chosen">
          <PatientLabel patient={patient} />
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setText('');
              onChange(null);
            }}
          >
            Change
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor="order-patient">Patient</label>
      <input
        id="order-patient"
        type="search"
        autoComplete="off"
        // Focused when it appears again after Change.
        autoFocus
        value={text}
        aria-describedby="order-patient-help"
        // Enter here cannot submit the order: Submit order stays disabled
        // until a patient is chosen, and then this box is gone.
        onChange={(event) => setText(event.target.value)}
      />
      <p id="order-patient-help" className="field-help">
        Type part of the patient’s first or last name
      </p>
      {/* No search until something is typed: an empty box lists nobody. */}
      {q !== '' && <PatientMatches q={q} onPick={onChange} />}
    </div>
  );
}

function PatientMatches({
  q,
  onPick,
}: {
  q: string;
  onPick: (patient: Patient) => void;
}) {
  const search = usePatientSearch(q);
  if (search.isPending) return <Loading label="Searching patients…" />;
  if (search.isError) {
    return (
      <ErrorMessage
        error={search.error}
        onRetry={() => void search.refetch()}
      />
    );
  }
  if (search.data.length === 0) {
    return <EmptyState message="No patients match" />;
  }
  return (
    <ul className="choices" aria-label="Matching patients">
      {search.data.map((patient) => (
        <li key={patient.id}>
          <button
            type="button"
            className="button-secondary"
            onClick={() => onPick(patient)}
          >
            <PatientLabel patient={patient} />
          </button>
        </li>
      ))}
    </ul>
  );
}
