import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { LabTest } from '../../shared/lab-tests';
import { formatCents } from '../../shared/money';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { ApiError } from '../api/client';
import { fetchLabTests, LAB_TESTS_KEY, updateLabTest } from './api';
import { LabTestForm } from './LabTestForm';

// "1 business day", "3 business days".
export function formatTurnaround(days: number): string {
  return `${days} business ${days === 1 ? 'day' : 'days'}`;
}

// The Lab tests page at /catalog: every test the clinic offers, and the form
// under the table, which adds a test or, after Edit on a row, edits that one.
// Tests are never deleted, only switched off (Deactivate), so there is no
// delete control.
export function CatalogPage() {
  const queryClient = useQueryClient();
  const labTests = useQuery({
    queryKey: LAB_TESTS_KEY,
    queryFn: ({ signal }) => fetchLabTests(signal),
  });
  const [editing, setEditing] = useState<LabTest | undefined>();
  // Activate and Deactivate apply at once, one row at a time.
  const toggle = useMutation({
    mutationFn: (test: LabTest) =>
      updateLabTest(test.id, { isActive: !test.isActive }),
    onSettled: async (_data, error) => {
      if (error === null || isNotFound(error)) {
        await queryClient.invalidateQueries({ queryKey: LAB_TESTS_KEY });
      }
    },
  });

  return (
    <>
      <h1>Lab tests</h1>
      <section aria-labelledby="lab-test-list">
        <h2 id="lab-test-list">All tests</h2>
        {toggle.isError && <ErrorMessage error={toggle.error} />}
        {labTests.isPending ? (
          <Loading label="Loading lab tests…" />
        ) : labTests.isError ? (
          <ErrorMessage
            error={labTests.error}
            onRetry={() => void labTests.refetch()}
          />
        ) : labTests.data.length === 0 ? (
          <EmptyState message="No lab tests yet. Add the first one below." />
        ) : (
          <LabTestTable
            labTests={labTests.data}
            onEdit={setEditing}
            onToggle={(test) => toggle.mutate(test)}
            togglingId={toggle.isPending ? toggle.variables.id : undefined}
          />
        )}
      </section>
      <section aria-labelledby="lab-test-form">
        <h2 id="lab-test-form">
          {editing ? `Edit ${editing.code}` : 'Add a lab test'}
        </h2>
        {/* A new key gives a fresh form: switching rows, or back to adding,
            never carries typed values or messages over. */}
        <LabTestForm
          key={editing?.id ?? 'add'}
          editing={editing}
          onDone={() => setEditing(undefined)}
        />
      </section>
    </>
  );
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NOT_FOUND';
}

function LabTestTable({
  labTests,
  onEdit,
  onToggle,
  togglingId,
}: {
  labTests: LabTest[];
  onEdit: (test: LabTest) => void;
  onToggle: (test: LabTest) => void;
  togglingId: string | undefined;
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Code</th>
          <th scope="col">Name</th>
          <th scope="col" className="numeric">
            Price
          </th>
          <th scope="col">Turnaround</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {labTests.map((test) => (
          // An inactive row is dimmed and says "Inactive": text, not only
          // the colour.
          <tr key={test.id} className={test.isActive ? undefined : 'muted'}>
            <td>{test.code}</td>
            <td className="wrap">{test.name}</td>
            <td className="numeric">{formatCents(test.priceCents)}</td>
            <td>{formatTurnaround(test.turnaroundDays)}</td>
            <td>{test.isActive ? 'Active' : 'Inactive'}</td>
            <td>
              <div className="row-actions">
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`Edit ${test.code}`}
                  onClick={() => onEdit(test)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`${test.isActive ? 'Deactivate' : 'Activate'} ${test.code}`}
                  disabled={togglingId === test.id}
                  onClick={() => onToggle(test)}
                >
                  {test.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
