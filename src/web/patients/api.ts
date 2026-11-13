// The patient requests the pages make, each checked with the shared schema.
import {
  type CreatePatientBody,
  type Patient,
  patientListSchema,
  patientSchema,
  type UpdatePatientBody,
} from '../../shared/patients';
import { apiFetch } from '../api/client';

// The TanStack Query key under which every patient query sits: creating or
// editing a patient invalidates it, which refreshes the lists and the pages.
export const PATIENTS_KEY = ['patients'] as const;

export const patientListKey = (q: string) =>
  [...PATIENTS_KEY, 'list', q] as const;
export const patientKey = (id: string) =>
  [...PATIENTS_KEY, 'detail', id] as const;

// Every patient, or those whose name matches `q` (docs/api.md).
export async function fetchPatients(
  q: string,
  signal?: AbortSignal,
): Promise<Patient[]> {
  const path = q
    ? `/api/patients?${new URLSearchParams({ q }).toString()}`
    : '/api/patients';
  return patientListSchema.parse(await apiFetch(path, { signal }));
}

export async function fetchPatient(
  id: string,
  signal?: AbortSignal,
): Promise<Patient> {
  return patientSchema.parse(
    await apiFetch(`/api/patients/${encodeURIComponent(id)}`, { signal }),
  );
}

export async function updatePatient({
  id,
  changes,
}: {
  id: string;
  changes: UpdatePatientBody;
}): Promise<Patient> {
  return patientSchema.parse(
    await apiFetch(`/api/patients/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: changes,
    }),
  );
}

export async function createPatient(body: CreatePatientBody): Promise<Patient> {
  return patientSchema.parse(
    await apiFetch('/api/patients', { method: 'POST', body }),
  );
}
