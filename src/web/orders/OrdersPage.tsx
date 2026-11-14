import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { formatDate, formatDateTime } from '../../shared/dates';
import { ORDER_STATUS_LABELS, ORDER_STATUSES } from '../../shared/orders';
import { formatCents } from '../../shared/money';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { StatusBadge } from '../components/StatusBadge';
import { PatientLabel, patientName } from '../patients/PatientLabel';
import { fetchOrders, orderListKey } from './api';
import {
  hasFilters,
  type OrderFilters,
  readFilters,
  writeFilters,
} from './filters';
import {
  OrderDetailPanel,
  useOpenOrder,
  useOpenOrderId,
} from './OrderDetailPanel';
import { NewOrderModal } from './NewOrderModal';
import { PatientFilter } from './PatientFilter';

// The home page: the orders, newest first, as the server sends them, a page
// at a time ("Load more"), narrowed by the status and patient filters kept in
// the address (?status=...&patientId=...; see filters.ts). Nothing
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
      <Filters />
      <OrderList />
      {/* The panel knows nothing of this page: it gets only the id. */}
      {openOrderId && <OrderDetailPanel orderId={openOrderId} />}
      {placing && <NewOrderModal onClose={() => setPlacing(false)} />}
    </>
  );
}

// The two filters. Changing one adds a history entry (so Back undoes it) and
// leaves every other parameter alone, ?order= included.
function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const setFilters = (next: OrderFilters) =>
    setParams((current) => writeFilters(current, next));
  return [filters, setFilters] as const;
}

function Filters() {
  const [filters, setFilters] = useFilters();
  return (
    <div className="form">
      <div className="field">
        <label htmlFor="orders-status-filter">Filter by status</label>
        <select
          id="orders-status-filter"
          value={filters.status ?? ''}
          onChange={(event) =>
            setFilters({
              ...filters,
              status: ORDER_STATUSES.find((s) => s === event.target.value),
            })
          }
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ORDER_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <PatientFilter
        patientId={filters.patientId}
        onChange={(patientId) => setFilters({ ...filters, patientId })}
      />
    </div>
  );
}

function OrderList() {
  const openOrder = useOpenOrder();
  const [filters, setFilters] = useFilters();
  const query = useOrders(filters);
  if (query.isPending) return <Loading label="Loading orders…" />;
  if (!query.data) {
    return (
      <ErrorMessage error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  const { clinicTimezone } = query.data.pages[0]!;
  // A new order placed between two pages can show up twice (offset paging:
  // docs/plan/backlog.md); a row is shown once.
  const seen = new Set<string>();
  const items = query.data.pages
    .flatMap((page) => page.items)
    .filter((order) => !seen.has(order.id) && seen.add(order.id));
  if (items.length === 0) {
    return hasFilters(filters) ? (
      <EmptyState
        message="No orders match these filters"
        action={
          <button type="button" onClick={() => setFilters({})}>
            Clear filters
          </button>
        }
      />
    ) : (
      <EmptyState message="No orders yet" />
    );
  }
  return (
    <>
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
      {query.hasNextPage && (
        <button
          type="button"
          className="button-secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
      {query.isError && (
        <ErrorMessage
          error={query.error}
          onRetry={() => void query.fetchNextPage()}
        />
      )}
    </>
  );
}

// The pages of orders for these filters. The next page starts after the rows
// already loaded (offset paging); a new filter is a new key, so it starts
// again from the first page.
function useOrders(filters: OrderFilters) {
  return useInfiniteQuery({
    queryKey: orderListKey(filters),
    queryFn: ({ pageParam, signal }) => fetchOrders(filters, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore
        ? pages.reduce((count, page) => count + page.items.length, 0)
        : undefined,
  });
}
