import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { LabTest } from '../../shared/lab-tests';
import type { CreateOrderBody } from '../../shared/orders';
import { formatCents } from '../../shared/money';
import type { Patient } from '../../shared/patients';
import { formatTurnaround } from '../catalog/CatalogPage';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { createOrder, ORDERS_KEY } from './api';
import { OrderPreview } from './OrderPreview';
import { PatientPicker } from './PatientPicker';
import { QuickAdd } from './QuickAdd';

// The New order modal: a native <dialog>, shown while this component is
// mounted (the page that opens it holds the open state). Pick a patient,
// add tests, "Submit order". On success it closes and the order list is
// refreshed; on a failure it stays open with the choices kept and shows the
// server's message with the request id.
//
// DOUBLE-SUBMIT PROTECTION (LAB-18): one idempotency key per opening of the
// modal, sent with every submit. A retry after a failure (a timeout, a lost
// reply) sends the same key, so if the first attempt did place the order the
// server returns it (200) instead of placing a second one. The page unmounts
// the modal when it closes, so the next opening (after a success, a Cancel or
// Escape) gets a new key. Known and accepted: changing the patient or tests
// after a failed submit and submitting again still sends the same key, so if
// the failed attempt had in fact placed an order, that first order is returned.
// Cancel or Escape while a submit is in flight close the modal at once; the
// order is still placed and appears when the list refreshes.
export function NewOrderModal({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const quickAdd = useRef<HTMLInputElement>(null);
  // Whatever had the focus when the modal opened (the button that opened
  // it), read while rendering: by the time effects run, a field inside has
  // taken the focus.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [patient, setPatient] = useState<Patient | null>(null);
  const [tests, setTests] = useState<LabTest[]>([]);
  // crypto.randomUUID needs a secure context: https, or localhost.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const queryClient = useQueryClient();
  const submit = useMutation({
    mutationFn: (body: CreateOrderBody) => createOrder(body, idempotencyKey),
    // A 200 (the order this key already placed) is a success like a 201.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      onClose();
    },
  });

  // Open as a modal, move the focus to the first field that can be used,
  // and give it back to the opener on close.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    element.querySelector<HTMLElement>('input:not(:disabled)')?.focus();
    return () => {
      element.close();
      opener?.focus();
    };
  }, [opener]);

  // Tests can only be added once a patient is chosen; changing the patient
  // keeps them.
  const canSubmit = patient !== null && tests.length > 0 && !submit.isPending;

  return (
    <dialog
      ref={dialog}
      className="dialog dialog-wide"
      aria-labelledby="new-order-title"
      // Escape closes a native dialog; tell the page. The `close` event is
      // queued, so it also arrives after the effect's own close(): in
      // development React runs the effect twice (StrictMode), and by then the
      // dialog is open again, so that event is ignored.
      onClose={() => {
        if (!dialog.current?.open) onClose();
      }}
    >
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          submit.mutate({
            patientId: patient.id,
            labTestIds: tests.map((test) => test.id),
          });
        }}
      >
        <h2 id="new-order-title">New order</h2>
        <PatientPicker patient={patient} onChange={setPatient} />
        <QuickAdd
          disabled={patient === null}
          selectedIds={tests.map((test) => test.id)}
          onAdd={(test) => setTests((chosen) => [...chosen, test])}
          inputRef={quickAdd}
        />
        <ChosenTests
          tests={tests}
          onRemove={(id) => {
            setTests((chosen) => chosen.filter((test) => test.id !== id));
            // The Remove button disappears with its row; the focus goes back
            // to the box, the next place to add a test.
            quickAdd.current?.focus();
          }}
        />
        <OrderPreview testIds={tests.map((test) => test.id)} />
        {submit.isError && <ErrorMessage error={submit.error} />}
        <div className="form-actions">
          <button type="submit" disabled={!canSubmit}>
            {submit.isPending ? 'Submitting…' : 'Submit order'}
          </button>
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ChosenTests({
  tests,
  onRemove,
}: {
  tests: LabTest[];
  onRemove: (id: string) => void;
}) {
  if (tests.length === 0) return <EmptyState message="No tests added yet" />;
  return (
    <table className="table" aria-label="Chosen tests">
      <thead>
        <tr>
          <th scope="col">Code</th>
          <th scope="col">Name</th>
          <th scope="col" className="numeric">
            Price
          </th>
          <th scope="col">Turnaround</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {tests.map((test) => (
          <tr key={test.id}>
            <td>{test.code}</td>
            <td>{test.name}</td>
            <td className="numeric">{formatCents(test.priceCents)}</td>
            <td>{formatTurnaround(test.turnaroundDays)}</td>
            <td>
              <button
                type="button"
                className="button-secondary"
                aria-label={`Remove ${test.code}`}
                onClick={() => onRemove(test.id)}
              >
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
