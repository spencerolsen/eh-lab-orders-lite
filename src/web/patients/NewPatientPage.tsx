import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  type CreatePatientBody,
  createPatientBody,
  type Patient,
} from '../../shared/patients';
import { ApiError } from '../api/client';
import { createPatient, PATIENTS_KEY } from './api';
import { DuplicateWarning } from './DuplicateWarning';
import { PatientForm } from './PatientForm';

// What the server warned about: the body it refused and the matches.
type Warning = { body: CreatePatientBody; matches: Patient[] };

// /patients/new: the patient form; on success, back to the list.
// When the server answers 409 POSSIBLE_DUPLICATE (LAB-10), nothing was
// created: the warning shows above the form, which keeps what was typed.
// Create anyway sends the same values again with confirmDuplicate: true.
// Editing any field removes the warning, so the next Save checks again (the
// confirmation never carries over to other values).
export function NewPatientPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [warning, setWarning] = useState<Warning | null>(null);
  const create = useMutation({
    mutationFn: createPatient,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });
      await navigate('/patients');
    },
  });

  async function save(body: CreatePatientBody) {
    setWarning(null);
    try {
      await create.mutateAsync(body);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'POSSIBLE_DUPLICATE' &&
        error.matches
      ) {
        // Not a failure to show as an error: the warning says it all.
        create.reset();
        setWarning({ body, matches: error.matches });
        return;
      }
      throw error;
    }
  }

  function edited() {
    setWarning(null);
    create.reset();
  }

  return (
    <>
      <h1>New patient</h1>
      {warning && (
        <DuplicateWarning
          matches={warning.matches}
          creating={create.isPending}
          error={create.error}
          onCreateAnyway={() =>
            create.mutate({ ...warning.body, confirmDuplicate: true })
          }
        />
      )}
      <PatientForm
        schema={createPatientBody}
        submitLabel="Save patient"
        onSubmit={save}
        onChange={edited}
        busy={create.isPending}
        secondaryAction={
          <Link className="button button-secondary" to="/patients">
            Cancel
          </Link>
        }
      />
    </>
  );
}
