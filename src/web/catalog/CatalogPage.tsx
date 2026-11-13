import { useQuery } from '@tanstack/react-query';

import type { LabTest } from '../../shared/lab-tests';
import { formatCents } from '../../shared/money';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { AddLabTestForm } from './AddLabTestForm';
import { fetchLabTests, LAB_TESTS_KEY } from './api';

// "1 business day", "3 business days".
export function formatTurnaround(days: number): string {
  return `${days} business ${days === 1 ? 'day' : 'days'}`;
}

// The Lab tests page at /catalog: every test the clinic offers, and the form
// to add one.
export function CatalogPage() {
  const labTests = useQuery({
    queryKey: LAB_TESTS_KEY,
    queryFn: ({ signal }) => fetchLabTests(signal),
  });

  return (
    <>
      <h1>Lab tests</h1>
      <section aria-labelledby="lab-test-list">
        <h2 id="lab-test-list">Catalog</h2>
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
          <LabTestTable labTests={labTests.data} />
        )}
      </section>
      <section aria-labelledby="add-lab-test">
        <h2 id="add-lab-test">Add a lab test</h2>
        <AddLabTestForm />
      </section>
    </>
  );
}

function LabTestTable({ labTests }: { labTests: LabTest[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Code</th>
          <th scope="col">Name</th>
          <th scope="col">Price</th>
          <th scope="col">Turnaround</th>
          <th scope="col">Active</th>
        </tr>
      </thead>
      <tbody>
        {labTests.map((test) => (
          <tr key={test.id}>
            <td>{test.code}</td>
            <td>{test.name}</td>
            <td>{formatCents(test.priceCents)}</td>
            <td>{formatTurnaround(test.turnaroundDays)}</td>
            <td>{test.isActive ? 'Yes' : 'No'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
