import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { formatDate, formatDateTime } from '../../shared/dates';
import { formatCents } from '../../shared/money';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { StatusBadge } from '../components/StatusBadge';
import { PatientLabel } from '../patients/PatientLabel';
import { fetchOrders, ORDERS_KEY } from './api';

// The home page: every order, newest first, as the server sends it. Nothing
// is worked out here: the total, the ready date and the clinic-time created
// time all come from the API. The created time is the clinic's wall clock
// (createdAtClinic), never converted to the browser's time zone, and its
// column says which zone that is.
export function OrdersPage() {
  return (
    <>
      <h1>Orders</h1>
      <OrderList query={useOrders()} />
    </>
  );
}

function OrderList({ query }: { query: ReturnType<typeof useOrders> }) {
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
        </tr>
      </thead>
      <tbody>
        {items.map((order) => (
          <tr key={order.id}>
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
