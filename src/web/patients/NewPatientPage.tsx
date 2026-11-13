import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';

import { createPatientBody } from '../../shared/patients';
import { createPatient, PATIENTS_KEY } from './api';
import { PatientForm } from './PatientForm';

// /patients/new: the patient form; on success, back to the list.
export function NewPatientPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: createPatient,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });
      await navigate('/patients');
    },
  });

  return (
    <>
      <h1>New patient</h1>
      <PatientForm
        schema={createPatientBody}
        submitLabel="Save patient"
        onSubmit={create.mutateAsync}
        secondaryAction={
          <Link className="button button-secondary" to="/patients">
            Cancel
          </Link>
        }
      />
    </>
  );
}
