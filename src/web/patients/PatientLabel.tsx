import { formatDate } from '../../shared/dates';
import type { Patient } from '../../shared/patients';

type Named = Pick<Patient, 'firstName' | 'lastName' | 'dateOfBirth'>;

// "Test Patient": first name, then last name.
export function patientName(patient: Named): string {
  return `${patient.firstName} ${patient.lastName}`;
}

// A patient's name with their date of birth, "Test Patient (born Mar 9,
// 1984)", so two people with the same name can be told apart. Used wherever a
// patient is named: the patient page (LAB-09) and the order screens.
export function PatientLabel({ patient }: { patient: Named }) {
  return (
    <span className="wrap">
      {patientName(patient)} (born {formatDate(patient.dateOfBirth)})
    </span>
  );
}
