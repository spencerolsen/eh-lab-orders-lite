// The patient requests the pages make, each checked with the shared schema.
import {
  type CreatePatientBody,
  type Patient,
  patientListSchema,
  patientSchema,
} from '../../shared/patients';
import { apiFetch } from '../api/client';

// The TanStack Query key of the patient list; creating a patient refreshes it.
export const PATIENTS_KEY = ['patients'] as const;

export async function fetchPatients(signal?: AbortSignal): Promise<Patient[]> {
  return patientListSchema.parse(await apiFetch('/api/patients', { signal }));
}

export async function createPatient(body: CreatePatientBody): Promise<Patient> {
  return patientSchema.parse(
    await apiFetch('/api/patients', { method: 'POST', body }),
  );
}
