import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import {
  type Patient,
  type UpdatePatientBody,
  updatePatientBody,
} from '../../shared/patients';
import { ApiError } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { fetchPatient, PATIENTS_KEY, patientKey, updatePatient } from './api';
import { changedFields, toFormValues } from './form-values';
import { PatientForm } from './PatientForm';
import { PatientLabel } from './PatientLabel';

// /patients/:id: the patient's details in the patient form, to correct them.
export function PatientPage() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: patientKey(id),
    queryFn: ({ signal }) => fetchPatient(id, signal),
  });

  if (query.isPending) return <Loading label="Loading patient…" />;
  if (query.isError) {
    // A malformed id (400) is as missing as an unknown one (404).
    if (
      query.error instanceof ApiError &&
      (query.error.status === 404 || query.error.status === 400)
    ) {
      return (
        <>
          <h1>Patient not found</h1>
          <EmptyState
            message="There is no patient at this address."
            action={
              <Link className="button" to="/patients">
                Back to patients
              </Link>
            }
          />
        </>
      );
    }
    return (
      <ErrorMessage error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  // Keyed by id, so opening another patient starts afresh.
  return <EditPatient key={query.data.id} patient={query.data} />;
}

function EditPatient({ patient: loaded }: { patient: Patient }) {
  const queryClient = useQueryClient();
  // The patient as loaded, then as each save returned it: what the form
  // starts from and what a change is measured against. (The query's copy
  // updates a moment after a save, too late for the form's remount.)
  const [patient, setPatient] = useState(loaded);
  // What the last save did, shown under the form until the next edit.
  const [status, setStatus] = useState<string>();
  // Bumped on each save, so the form starts again from the stored values.
  const [saves, setSaves] = useState(0);
  const update = useMutation({
    mutationFn: updatePatient,
    onSuccess: async (saved) => {
      queryClient.setQueryData(patientKey(saved.id), saved);
      // The lists (and this page, already up to date) are refreshed.
      await queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });
    },
  });

  // Only the fields that differ from the stored patient are sent.
  async function save(parsed: UpdatePatientBody) {
    setStatus(undefined);
    const changes = changedFields(parsed, patient);
    if (Object.keys(changes).length === 0) {
      setStatus('No changes to save.');
      return;
    }
    setPatient(await update.mutateAsync({ id: patient.id, changes }));
    setSaves((count) => count + 1);
    setStatus('Saved');
  }

  return (
    <>
      <h1>
        <PatientLabel patient={patient} />
      </h1>
      <PatientForm
        key={saves}
        schema={updatePatientBody}
        initialValues={toFormValues(patient)}
        submitLabel="Save changes"
        onSubmit={save}
        onChange={() => setStatus(undefined)}
        secondaryAction={
          <Link className="button button-secondary" to="/patients">
            Back to patients
          </Link>
        }
      />
      <p role="status" className="muted">
        {status}
      </p>
    </>
  );
}
