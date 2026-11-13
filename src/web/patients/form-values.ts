// Between a stored patient and the patient form's text fields.
import type { Patient, UpdatePatientBody } from '../../shared/patients';
import { formatPhone } from '../../shared/phone';
import type { PatientFormValues } from './PatientForm';

// A stored patient as the form's text: an absent email or phone (null) is an
// empty field, and the phone is shown as (801) 555-0101.
export function toFormValues(patient: Patient): PatientFormValues {
  return {
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth,
    email: patient.email ?? '',
    phone: patient.phone === null ? '' : formatPhone(patient.phone),
  };
}

const FIELDS = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'email',
  'phone',
] as const satisfies (keyof UpdatePatientBody)[];

// The fields of `parsed` (the form's values, parsed and normalized by the
// update schema) that differ from the stored patient: what a PATCH sends.
// Compared after normalizing, so a phone retyped as 801.555.0101 is no change.
export function changedFields(
  parsed: UpdatePatientBody,
  patient: Patient,
): UpdatePatientBody {
  const changes: UpdatePatientBody = {};
  for (const field of FIELDS) {
    const value = parsed[field];
    if (value !== undefined && value !== patient[field]) {
      Object.assign(changes, { [field]: value });
    }
  }
  return changes;
}
