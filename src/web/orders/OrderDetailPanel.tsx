import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

import { formatDate, formatDateTime } from '../../shared/dates';
import { formatCents } from '../../shared/money';
import {
  type CancelOrderBody,
  ORDER_STATUS_LABELS,
  type OrderDetail,
  type OrderTransitionBody,
} from '../../shared/orders';
import { ApiError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { StatusBadge } from '../components/StatusBadge';
import { patientName } from '../patients/PatientLabel';
import {
  cancelOrder,
  changeOrderStatus,
  fetchOrder,
  ORDERS_KEY,
  orderKey,
} from './api';
import { CancelOrderForm } from './CancelOrderForm';

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

// A slide-out panel that shows one order, moves its status forward and
// cancels it. Its
// only input is the order id: it fetches its own data and knows nothing about
// the page it sits on. It is shown while it is mounted, and it closes itself
// by removing ?order= from the address, so any page can show it for an id in
// the URL.
// Focus goes inside when it opens and back to what had it when it closes.
export function OrderDetailPanel({ orderId }: { orderId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [, setSearchParams] = useSearchParams();
  const query = useOrder(orderId);

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
      {/* The dialog's name: "Order for <patient>" once the order has loaded. */}
      <h2 id="order-panel-title">
        {query.data ? `Order for ${patientName(query.data.patient)}` : 'Order'}
      </h2>
      <PanelBody orderId={orderId} query={query} />
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

// An address that is not an id cannot name an order: no request is made.
const isWellFormed = (orderId: string) => uuid.safeParse(orderId).success;

function useOrder(orderId: string) {
  return useQuery({
    queryKey: orderKey(orderId),
    queryFn: ({ signal }) => fetchOrder(orderId, signal),
    enabled: isWellFormed(orderId),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === 404) && count < 1,
  });
}

function PanelBody({
  orderId,
  query,
}: {
  orderId: string;
  query: ReturnType<typeof useOrder>;
}) {
  const wellFormed = isWellFormed(orderId);

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
  // Whether the cancel form is open (LAB-17).
  const [cancelling, setCancelling] = useState(false);
  // The one error shown: the latest. It belongs to the order as the panel
  // loaded it (`order`), so it disappears when the order reloads as something
  // else; a refusal because the order changed is kept as "changed" and read
  // against the reloaded order.
  const [problem, setProblem] = useState<{
    order: OrderDetail;
    error: unknown;
    changed: boolean;
  } | null>(null);
  const shownProblem = problem?.order === order ? problem : null;

  // What a status change and a cancel do with the server's answer.
  const answer = {
    onSuccess: (changed: OrderDetail) => {
      setProblem(null);
      // The panel shows the server's answer at once, and the list behind it
      // refreshes through the shared ORDERS_KEY (the panel never touches the
      // list itself).
      queryClient.setQueryData(orderKey(order.id), changed);
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
    onError: async (error: Error) => {
      // 409: someone else changed the order between the server's read and its
      // update. 422: the server refused the move from the status it read, and
      // the action was only offered from the status this panel shows, so the
      // order changed since the panel loaded it (another tab moved it). Either
      // way, reload it (and the list), so the user sees its real status and
      // the actions allowed from there. The panel then says the order has
      // changed, rather than showing the server's sentence about a move that
      // was only wrong because the panel was out of date.
      if (
        error instanceof ApiError &&
        (error.status === 409 || error.status === 422)
      ) {
        await queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
        const reloaded = queryClient.getQueryData<OrderDetail>(
          orderKey(order.id),
        );
        if (reloaded && reloaded !== order) {
          setProblem({ order: reloaded, error, changed: true });
          return;
        }
      }
      setProblem({ order, error, changed: false });
    },
    onSettled: () => statusLine.current?.focus(),
  };

  // Starting an action clears the error of the one before.
  const change = useMutation({
    mutationFn: (to: OrderTransitionBody['to']) =>
      changeOrderStatus(order.id, { to }),
    onMutate: () => setProblem(null),
    ...answer,
  });

  const cancel = useMutation({
    mutationFn: (body: CancelOrderBody) => cancelOrder(order.id, body),
    onMutate: () => setProblem(null),
    ...answer,
    onSuccess: (changed) => {
      setCancelling(false);
      answer.onSuccess(changed);
    },
  });

  const busy = change.isPending || cancel.isPending;

  return (
    <div className="stack">
      <p ref={statusLine} tabIndex={-1}>
        <StatusBadge status={order.status} />
      </p>
      {order.cancellation && (
        // The time is on the clinic's clock, as the created time below is.
        <p className="cancellation">
          {`Cancelled by ${order.cancellation.cancelledBy} on ${formatDateTime(
            order.cancellation.cancelledAtClinic,
          )}: ${order.cancellation.note}`}
        </p>
      )}
      {/* One button per move the server allows, and Cancel order when the
          server says it can be cancelled; none for a final order. A 409 or
          422 shows the server's message, with the request id. */}
      {(order.allowedNextStatuses.length > 0 ||
        (order.canCancel && !cancelling)) && (
        <div className="form-actions">
          {order.allowedNextStatuses.map((to) => (
            <button
              key={to}
              type="button"
              disabled={busy}
              // The server's table never offers ordered or cancelled here.
              onClick={() => change.mutate(to as OrderTransitionBody['to'])}
            >
              Mark {ORDER_STATUS_LABELS[to].toLowerCase()}
            </button>
          ))}
          {order.canCancel && !cancelling && (
            <button
              type="button"
              className="button-danger"
              disabled={busy}
              onClick={() => {
                setProblem(null);
                setCancelling(true);
              }}
            >
              Cancel order
            </button>
          )}
        </div>
      )}
      {order.canCancel && cancelling && (
        <CancelOrderForm
          sending={busy}
          onConfirm={(body) => cancel.mutate(body)}
          onKeep={() => {
            setProblem(null);
            setCancelling(false);
          }}
        />
      )}
      {shownProblem?.changed && (
        <div role="alert" className="error-message">
          <p>{`This order has changed. It is now ${ORDER_STATUS_LABELS[order.status]}.`}</p>
        </div>
      )}
      {shownProblem && !shownProblem.changed && (
        <ErrorMessage error={shownProblem.error} />
      )}
      <dl className="details">
        <dt>Patient</dt>
        <dd>{patientName(order.patient)}</dd>
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
              <td className="wrap">{item.testName}</td>
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
