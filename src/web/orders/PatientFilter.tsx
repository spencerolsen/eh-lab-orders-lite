import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { fetchPatient, patientKey } from '../patients/api';
import { PatientLabel } from '../patients/PatientLabel';
import { useDebouncedValue } from '../patients/usePatientSearch';
import { PatientMatches } from './PatientPicker';

// The orders list's patient filter. Given no patient id, a name search to
// pick from (the same search as the New order modal). Given one (the address
// holds only the id), it fetches that patient and shows their name with date
// of birth and a button that removes the filter.
export function PatientFilter({
  patientId,
  onChange,
}: {
  patientId: string | undefined;
  onChange: (patientId: string | undefined) => void;
}) {
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim());

  if (patientId) {
    return (
      <div className="field">
        <span className="field-label">Filter by patient</span>
        <ChosenPatient
          patientId={patientId}
          onClear={() => onChange(undefined)}
        />
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor="orders-patient-filter">Filter by patient</label>
      <input
        id="orders-patient-filter"
        type="search"
        autoComplete="off"
        value={text}
        aria-describedby="orders-patient-filter-help"
        onChange={(event) => setText(event.target.value)}
      />
      <p id="orders-patient-filter-help" className="field-help">
        Type part of the patient’s first or last name
      </p>
      {q !== '' && (
        <PatientMatches
          q={q}
          onPick={(patient) => {
            setText('');
            onChange(patient.id);
          }}
        />
      )}
    </div>
  );
}

function ChosenPatient({
  patientId,
  onClear,
}: {
  patientId: string;
  onClear: () => void;
}) {
  const patient = useQuery({
    queryKey: patientKey(patientId),
    queryFn: ({ signal }) => fetchPatient(patientId, signal),
  });
  return (
    <div className="chosen">
      {patient.isPending && <Loading label="Loading patient…" />}
      {patient.isError && (
        <ErrorMessage
          error={patient.error}
          onRetry={() => void patient.refetch()}
        />
      )}
      {patient.data && <PatientLabel patient={patient.data} />}
      <button type="button" className="button-secondary" onClick={onClear}>
        Remove patient filter
      </button>
    </div>
  );
}
