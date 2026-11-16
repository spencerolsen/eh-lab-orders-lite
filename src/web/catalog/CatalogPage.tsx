import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import {
  CATALOG_SEARCH_MAX_LENGTH,
  type LabTest,
} from '../../shared/lab-tests';
import { formatCents } from '../../shared/money';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { ApiError } from '../api/client';
import { fetchLabTests, LAB_TESTS_KEY, updateLabTest } from './api';
import { LabTestForm } from './LabTestForm';
import { searchLabTests } from './search';

// "1 business day", "3 business days".
export function formatTurnaround(days: number): string {
  return `${days} business ${days === 1 ? 'day' : 'days'}`;
}

// The Lab tests page at /catalog: every test the clinic offers, and the form
// under the table, which adds a test or, after Edit on a row, edits that one.
// Tests are never deleted, only switched off (Deactivate), so there is no
// delete control. Deactivating asks first (ConfirmDialog); activating does
// not. The search box filters the loaded list in the browser (the catalog
// comes whole in one response) and keeps its text in the address (?q=).
export function CatalogPage() {
  const queryClient = useQueryClient();
  const labTests = useQuery({
    queryKey: LAB_TESTS_KEY,
    queryFn: ({ signal }) => fetchLabTests(signal),
  });
  const [editing, setEditing] = useState<LabTest | undefined>();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').slice(0, CATALOG_SEARCH_MAX_LENGTH);
  const [text, setText] = useState(q);
  // When the address changes from outside (Back, a link), the box follows it.
  // Not when it already says the same, so a trailing space just typed stays.
  const [shownQ, setShownQ] = useState(q);
  if (q !== shownQ) {
    setShownQ(q);
    if (text !== q && !(text.trim() === '' && q === '')) setText(q);
  }
  function search(next: string) {
    setText(next);
    // Replace, not push: Back does not step through each keystroke.
    void setParams(next.trim() ? { q: next } : {}, { replace: true });
  }

  // Both calls refresh the list when they are done (or when the test is gone).
  async function refresh(error: unknown) {
    if (error === null || isNotFound(error)) {
      await queryClient.invalidateQueries({ queryKey: LAB_TESTS_KEY });
    }
  }
  // Activate applies at once, one row at a time.
  const activate = useMutation({
    mutationFn: (test: LabTest) => updateLabTest(test.id, { isActive: true }),
    onSettled: (_data, error) => refresh(error),
  });
  // Deactivate waits for the confirmation; its error is shown in the dialog.
  const [confirming, setConfirming] = useState<LabTest | undefined>();
  const deactivate = useMutation({
    mutationFn: (test: LabTest) => updateLabTest(test.id, { isActive: false }),
    onSettled: (_data, error) => refresh(error),
  });
  function closeConfirm() {
    setConfirming(undefined);
    deactivate.reset();
  }

  return (
    <>
      <h1>Lab tests</h1>
      <section aria-labelledby="lab-test-list">
        <h2 id="lab-test-list">All tests</h2>
        {activate.isError && <ErrorMessage error={activate.error} />}
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
          <CatalogList
            labTests={labTests.data}
            text={text}
            onSearch={search}
            onEdit={setEditing}
            onActivate={(test) => activate.mutate(test)}
            onDeactivate={(test) => {
              deactivate.reset();
              setConfirming(test);
            }}
            togglingId={activate.isPending ? activate.variables.id : undefined}
          />
        )}
      </section>
      {confirming && (
        <ConfirmDialog
          title={`Deactivate ${confirming.code}?`}
          confirmLabel="Deactivate test"
          pendingLabel="Deactivating…"
          cancelLabel="Keep active"
          pending={deactivate.isPending}
          error={deactivate.error}
          onConfirm={() =>
            deactivate.mutate(confirming, { onSuccess: closeConfirm })
          }
          onCancel={closeConfirm}
        >
          <p>
            Deactivate <strong>{confirming.code}</strong> ({confirming.name})?
            It can no longer be added to new orders. Orders that already include
            it keep it. You can activate it again later.
          </p>
        </ConfirmDialog>
      )}
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

// The search box, "3 of 8 tests", and the table or the no-match state.
function CatalogList({
  labTests,
  text,
  onSearch,
  ...rest
}: {
  labTests: LabTest[];
  text: string;
  onSearch: (text: string) => void;
  onEdit: (test: LabTest) => void;
  onActivate: (test: LabTest) => void;
  onDeactivate: (test: LabTest) => void;
  togglingId: string | undefined;
}) {
  const shown = searchLabTests(text, labTests);
  return (
    <>
      <form
        className="form"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="field">
          <label htmlFor="catalog-search">Search by code or name</label>
          <input
            id="catalog-search"
            type="search"
            value={text}
            maxLength={CATALOG_SEARCH_MAX_LENGTH}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </form>
      <p role="status" className="muted search-status">
        {shown.length} of {labTests.length}{' '}
        {labTests.length === 1 ? 'test' : 'tests'}
      </p>
      {shown.length === 0 ? (
        <EmptyState
          message="No lab test matches this search."
          action={
            <button
              type="button"
              className="button-secondary"
              onClick={() => onSearch('')}
            >
              Clear the search
            </button>
          }
        />
      ) : (
        <LabTestTable labTests={shown} {...rest} />
      )}
    </>
  );
}

function LabTestTable({
  labTests,
  onEdit,
  onActivate,
  onDeactivate,
  togglingId,
}: {
  labTests: LabTest[];
  onEdit: (test: LabTest) => void;
  onActivate: (test: LabTest) => void;
  onDeactivate: (test: LabTest) => void;
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
                  onClick={() =>
                    test.isActive ? onDeactivate(test) : onActivate(test)
                  }
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
