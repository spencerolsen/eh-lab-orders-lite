import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { formatDate } from '../../shared/dates';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { fetchPatients, PATIENTS_KEY } from './api';
import { patientName } from './PatientLabel';

// /patients: every patient, by last name, with a way to add one.
export function PatientsPage() {
  return (
    <>
      <div className="page-header">
        <h1>Patients</h1>
        <Link className="button" to="/patients/new">
          New patient
        </Link>
      </div>
      <PatientList query={usePatients()} />
    </>
  );
}

function PatientList({ query }: { query: ReturnType<typeof usePatients> }) {
  if (query.isPending) return <Loading label="Loading patients…" />;
  if (query.isError) {
    return (
      <ErrorMessage error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  if (query.data.length === 0)
    return (
      <EmptyState message="No patients yet. Add the first one with New patient." />
    );
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Date of birth</th>
          <th scope="col">Email</th>
          <th scope="col">Phone</th>
        </tr>
      </thead>
      <tbody>
        {query.data.map((patient) => (
          <tr key={patient.id}>
            <td>{patientName(patient)}</td>
            <td>{formatDate(patient.dateOfBirth)}</td>
            <td>{patient.email ?? ''}</td>
            <td>{patient.phone ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function usePatients() {
  return useQuery({
    queryKey: PATIENTS_KEY,
    queryFn: ({ signal }) => fetchPatients(signal),
  });
}
