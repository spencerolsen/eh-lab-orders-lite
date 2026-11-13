import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

import { formatDate, formatDateTime } from '../../shared/dates';
import { formatCents } from '../../shared/money';
import { ApiError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { StatusBadge } from '../components/StatusBadge';
import { PatientLabel } from '../patients/PatientLabel';
import { fetchOrder, orderKey } from './api';

// The query parameter that holds the open order: "?order=<id>".
export const ORDER_PARAM = 'order';

// Opens an order's panel by putting it in the address (adds a history entry).
export function useOpenOrder(): (id: string) => void {
  const [, setSearchParams] = useSearchParams();
  return (id) =>
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set(ORDER_PARAM, id);
      return next;
    });
}

// The order's id in the address, or null when no panel should be open.
export function useOpenOrderId(): string | null {
  return useSearchParams()[0].get(ORDER_PARAM);
}

// A slide-out panel that shows one order, read-only. Its only input is the
// order id: it fetches its own data and knows nothing about the page it sits
// on. It is shown while it is mounted, and it closes itself by removing
// ?order= from the address, so any page can show it for an id in the URL.
// Focus goes inside when it opens and back to what had it when it closes.
export function OrderDetailPanel({ orderId }: { orderId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [, setSearchParams] = useSearchParams();

  // What had focus before the panel opened (kept across React's development
  // double run of effects, when focus has already moved into the panel).
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const element = dialog.current;
    opener.current ??= document.activeElement;
    if (element && !element.open) element.showModal();
    return () => {
      // Removing a dialog from the page closes it. Focus goes back once the
      // element is really gone, not when React only re-runs the effect.
      setTimeout(() => {
        const from = opener.current;
        if (!element?.isConnected && from instanceof HTMLElement) from.focus();
      });
    };
  }, []);

  // Escape, the Close button and a click on the backdrop all end up here.
  function close() {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete(ORDER_PARAM);
      return next;
    });
  }

  return (
    <dialog
      ref={dialog}
      className="panel"
      aria-labelledby="order-panel-title"
      onClose={close}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
    >
      <h2 id="order-panel-title">Order</h2>
      <PanelBody orderId={orderId} />
      <div className="form-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => dialog.current?.close()}
        >
          Close
        </button>
      </div>
    </dialog>
  );
}

const uuid = z.uuid();

function PanelBody({ orderId }: { orderId: string }) {
  // An address that is not an id cannot name an order: no request is made.
  const wellFormed = uuid.safeParse(orderId).success;
  const query = useQuery({
    queryKey: orderKey(orderId),
    queryFn: ({ signal }) => fetchOrder(orderId, signal),
    enabled: wellFormed,
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === 404) && count < 1,
  });

  if (
    !wellFormed ||
    (query.error instanceof ApiError && query.error.status === 404)
  ) {
    return <p role="alert">Order not found</p>;
  }
  if (query.isPending) return <Loading label="Loading order…" />;
  if (query.isError) {
    return (
      <ErrorMessage error={query.error} onRetry={() => void query.refetch()} />
    );
  }

  const order = query.data;
  return (
    <div className="stack">
      <p>
        <StatusBadge status={order.status} />
      </p>
      <dl className="details">
        <dt>Patient</dt>
        <dd>
          <PatientLabel patient={order.patient} />
        </dd>
        <dt>Ready by</dt>
        <dd>{formatDate(order.estimatedReadyDate)}</dd>
        <dt>Created ({order.clinicTimezone})</dt>
        <dd>{formatDateTime(order.createdAtClinic)}</dd>
      </dl>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Test</th>
            <th scope="col" className="numeric">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.labTestId}>
              <td>{item.testCode}</td>
              <td>{item.testName}</td>
              <td className="numeric">{formatCents(item.priceCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>Total {formatCents(order.totalCents)}</strong>
      </p>
    </div>
  );
}
