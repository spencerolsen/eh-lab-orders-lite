import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

import { formatDate, formatDateTime } from '../../shared/dates';
import { formatCents } from '../../shared/money';
import {
  ORDER_STATUS_LABELS,
  type OrderDetail,
  type OrderTransitionBody,
} from '../../shared/orders';
import { ApiError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { StatusBadge } from '../components/StatusBadge';
import { PatientLabel } from '../patients/PatientLabel';
import { changeOrderStatus, fetchOrder, ORDERS_KEY, orderKey } from './api';

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

// A slide-out panel that shows one order and moves its status forward. Its
// only input is the order id: it fetches its own data and knows nothing about
// the page it sits on. It is shown while it is mounted, and it closes itself
// by removing ?order= from the address, so any page can show it for an id in
// the URL.
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
  // It replaces the history entry, so Back after closing leaves the page
  // instead of reopening the panel.
  function close() {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete(ORDER_PARAM);
        return next;
      },
      { replace: true },
    );
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

  return <OrderView order={query.data} />;
}

function OrderView({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient();
  // Focus lands on the status line after a change, so it stays inside the
  // panel when the pressed button goes away.
  const statusLine = useRef<HTMLParagraphElement>(null);

  const change = useMutation({
    mutationFn: (to: OrderTransitionBody['to']) =>
      changeOrderStatus(order.id, { to }),
    onSuccess: (changed) => {
      // The panel shows the server's answer at once, and the list behind it
      // refreshes through the shared ORDERS_KEY (the panel never touches the
      // list itself).
      queryClient.setQueryData(orderKey(order.id), changed);
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
    onError: (error) => {
      // 409: someone else changed the order between the server's read and its
      // update. 422: the server refused the move from the status it read, and
      // the button was only offered from the status this panel shows, so the
      // order changed since the panel loaded it (another tab moved it). Either
      // way, reload it (and the list), so the user sees its real status and
      // the moves allowed from there.
      if (
        error instanceof ApiError &&
        (error.status === 409 || error.status === 422)
      ) {
        void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      }
    },
    onSettled: () => statusLine.current?.focus(),
  });

  return (
    <div className="stack">
      <p ref={statusLine} tabIndex={-1}>
        <StatusBadge status={order.status} />
      </p>
      {/* One button per move the server allows; none for a final order. A
          409 or 422 shows the server's message, with the request id. */}
      {order.allowedNextStatuses.length > 0 && (
        <div className="form-actions">
          {order.allowedNextStatuses.map((to) => (
            <button
              key={to}
              type="button"
              disabled={change.isPending}
              // The server's table never offers ordered or cancelled here.
              onClick={() => change.mutate(to as OrderTransitionBody['to'])}
            >
              Mark {ORDER_STATUS_LABELS[to].toLowerCase()}
            </button>
          ))}
        </div>
      )}
      {change.isError && <ErrorMessage error={change.error} />}
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
