import { type FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { formatDate } from '../../shared/dates';
import { SEARCH_MAX_LENGTH, SEARCH_RESULT_LIMIT } from '../../shared/patients';
import { formatPhone } from '../../shared/phone';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { patientName } from './PatientLabel';
import { useDebouncedValue, usePatientSearch } from './usePatientSearch';

// /patients: every patient, by last name, or those whose name matches the
// search. The search text is kept in the URL (/patients?q=smith), so a reload
// or a shared link shows the same results.
export function PatientsPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [text, setText] = useState(q);

  // When the URL changes from outside (the menu's Patients link, Back), the
  // box follows it. Not when it already matches, so a trailing space the user
  // just typed is kept.
  const [shownQ, setShownQ] = useState(q);
  if (q !== shownQ) {
    setShownQ(q);
    if (text.trim() !== q) setText(q);
  }

  // Search once typing pauses (SEARCH_DELAY_MS), not on every keystroke: the
  // trimmed text goes into the URL, which runs the query. It replaces the
  // history entry, so Back does not step through each search. Only once the
  // text has settled: just after the URL changed from outside, `settled`
  // still holds the old text and must not write it back.
  const settled = useDebouncedValue(text);
  useEffect(() => {
    if (settled !== text) return;
    const next = settled.trim();
    if (next !== q) void setParams(next ? { q: next } : {}, { replace: true });
  }, [settled, text, q, setParams]);

  // Enter searches at once.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = text.trim();
    if (next !== q) void setParams(next ? { q: next } : {}, { replace: true });
  }

  return (
    <>
      <div className="page-header">
        <h1>Patients</h1>
        <Link className="button" to="/patients/new">
          New patient
        </Link>
      </div>
      <form className="form" role="search" onSubmit={submit}>
        <div className="field">
          <label htmlFor="patient-search">Search by name</label>
          <input
            id="patient-search"
            type="search"
            value={text}
            maxLength={SEARCH_MAX_LENGTH}
            onChange={(event) => setText(event.target.value)}
            aria-describedby="patient-search-help"
          />
          <p id="patient-search-help" className="field-help">
            Part of the first name, the last name, or both.
          </p>
        </div>
      </form>
      <PatientList q={q} query={usePatientSearch(q)} />
    </>
  );
}

function PatientList({
  q,
  query,
}: {
  q: string;
  query: ReturnType<typeof usePatientSearch>;
}) {
  if (query.isPending) return <Loading label="Loading patients…" />;
  if (query.isError) {
    return (
      <ErrorMessage error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  if (query.data.length === 0) {
    return (
      <EmptyState
        message={
          q
            ? 'No patients match'
            : 'No patients yet. Add the first one with New patient.'
        }
      />
    );
  }
  return (
    <>
      {q && query.data.length >= SEARCH_RESULT_LIMIT && (
        <p className="muted">
          Showing the first {SEARCH_RESULT_LIMIT} matches. Type more of the name
          to narrow the search.
        </p>
      )}
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Date of birth</th>
            <th scope="col">Email</th>
            <th scope="col">Phone</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {query.data.map((patient) => (
            <tr key={patient.id}>
              <td className="wrap">
                <Link to={`/patients/${patient.id}`}>
                  {patientName(patient)}
                </Link>
              </td>
              <td className="nowrap">{formatDate(patient.dateOfBirth)}</td>
              <td>{patient.email ?? ''}</td>
              <td>{patient.phone ? formatPhone(patient.phone) : ''}</td>
              <td>
                {/* Like the catalog's row actions; a link, because editing
                    a patient is a page of its own. */}
                <div className="row-actions">
                  <Link
                    className="button button-secondary"
                    to={`/patients/${patient.id}`}
                    aria-label={`Edit ${patientName(patient)}`}
                  >
                    Edit
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
