import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import { formatDate, formatDateTime } from '../../shared/dates';
import { formatCents } from '../../shared/money';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { StatusBadge } from '../components/StatusBadge';
import { PatientLabel, patientName } from '../patients/PatientLabel';
import { fetchOrders, ORDERS_KEY } from './api';
import {
  OrderDetailPanel,
  useOpenOrder,
  useOpenOrderId,
} from './OrderDetailPanel';
import { NewOrderModal } from './NewOrderModal';

// The home page: every order, newest first, as the server sends it. Nothing
// is worked out here: the total, the ready date and the clinic-time created
// time all come from the API. The created time is the clinic's wall clock
// (createdAtClinic), never converted to the browser's time zone, and its
// column says which zone that is. "Place new order" opens the New order
// modal (LAB-12); the page holds whether it is open.
export function OrdersPage() {
  const openOrderId = useOpenOrderId();
  const [placing, setPlacing] = useState(false);
  return (
    <>
      <div className="page-header">
        <h1>Orders</h1>
        <button type="button" onClick={() => setPlacing(true)}>
          Place new order
        </button>
      </div>
      <OrderList query={useOrders()} />
      {/* The panel knows nothing of this page: it gets only the id. */}
      {openOrderId && <OrderDetailPanel orderId={openOrderId} />}
      {placing && <NewOrderModal onClose={() => setPlacing(false)} />}
    </>
  );
}

function OrderList({ query }: { query: ReturnType<typeof useOrders> }) {
  const openOrder = useOpenOrder();
  if (query.isPending) return <Loading label="Loading orders…" />;
  if (query.isError) {
    return (
      <ErrorMessage error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  const { items, clinicTimezone } = query.data;
  if (items.length === 0) return <EmptyState message="No orders yet" />;
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Patient</th>
          <th scope="col" className="numeric">
            Tests
          </th>
          <th scope="col" className="numeric">
            Total
          </th>
          <th scope="col">Ready by</th>
          <th scope="col">Status</th>
          <th scope="col">Created ({clinicTimezone})</th>
          <th scope="col">Details</th>
        </tr>
      </thead>
      <tbody>
        {items.map((order) => (
          // A click anywhere on the row opens the order; the patient link keeps
          // its own meaning. Keyboard users use the View button in the last cell.
          <tr
            key={order.id}
            className="clickable"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a, button')) return;
              event.currentTarget.querySelector('button')?.focus();
              openOrder(order.id);
            }}
          >
            <td>
              {/* The patient page, as a name links on the Patients list. */}
              <Link to={`/patients/${order.patient.id}`}>
                <PatientLabel patient={order.patient} />
              </Link>
            </td>
            <td className="numeric">{order.testCount}</td>
            <td className="numeric">{formatCents(order.totalCents)}</td>
            <td>{formatDate(order.estimatedReadyDate)}</td>
            <td>
              <StatusBadge status={order.status} />
            </td>
            <td>{formatDateTime(order.createdAtClinic)}</td>
            <td>
              <button
                type="button"
                className="button-secondary"
                aria-label={`View order for ${patientName(order.patient)}`}
                onClick={() => openOrder(order.id)}
              >
                View
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useOrders() {
  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: ({ signal }) => fetchOrders(signal),
  });
}
