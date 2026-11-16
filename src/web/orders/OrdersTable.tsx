import { useInfiniteQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { Link } from 'react-router';

import type { OrderSort } from '../../shared/orders';
import { formatDate, formatDateTime } from '../../shared/dates';
import { formatCents } from '../../shared/money';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { StatusBadge } from '../components/StatusBadge';
import { PatientLabel, patientName } from '../patients/PatientLabel';
import { fetchOrders, orderListKey } from './api';
import {
  DEFAULT_SORT_STATE,
  hasFilters,
  nextSort,
  type OrderFilters,
  type OrderSortState,
} from './filters';
import { useOpenOrder } from './OrderDetailPanel';

// The orders matching `filters`, newest first, as the server sends them, a
// page at a time ("Load more"). Shared by the orders page and the patient
// page; a click on a row opens the order's panel (?order=<id>). Nothing is
// worked out here: the total, the ready date and the clinic-time created time
// all come from the API. The created time is the clinic's wall clock
// (createdAtClinic), never converted to the browser's time zone, and its
// column says which zone that is.
// `showPatient` adds the Patient column (the patient page leaves it out).
// With filters, an empty list offers `onClearFilters` when it is given.
// `sort` and `onSortChange` make the Patient, Ready by, Status and Created
// headers sort buttons (the server sorts; docs/api.md); without `onSortChange`
// the headers are plain text and the order is newest first (the patient page).
export function OrdersTable({
  filters,
  showPatient,
  onClearFilters,
  sort = DEFAULT_SORT_STATE,
  onSortChange,
}: {
  filters: OrderFilters;
  showPatient: boolean;
  onClearFilters?: () => void;
  sort?: OrderSortState;
  onSortChange?: (sort: OrderSortState) => void;
}) {
  const openOrder = useOpenOrder();
  const query = useOrders(filters, sort);
  // A new sort shows the loading state like a new filter does, which removes
  // the header, so the clicked button is focused again once the new table is
  // there.
  const refocus = useRef<OrderSort | null>(null);
  const header = (column: OrderSort, label: string) =>
    onSortChange ? (
      <SortHeader
        column={column}
        label={label}
        sort={sort}
        refocusRef={refocus}
        onClick={() => {
          refocus.current = column;
          onSortChange(nextSort(sort, column));
        }}
      />
    ) : (
      <th scope="col">{label}</th>
    );
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
    return hasFilters(filters) && onClearFilters ? (
      <EmptyState
        message="No orders match these filters"
        action={
          <button type="button" onClick={onClearFilters}>
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
            {showPatient && header('patient', 'Patient')}
            <th scope="col" className="numeric">
              Tests
            </th>
            <th scope="col" className="numeric">
              Total
            </th>
            {header('readyBy', 'Ready by')}
            {header('status', 'Status')}
            {header('created', `Created (${clinicTimezone})`)}
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
              {showPatient && (
                <td>
                  {/* The patient page, as a name links on the Patients list. */}
                  <Link to={`/patients/${order.patient.id}`}>
                    <PatientLabel patient={order.patient} />
                  </Link>
                </td>
              )}
              <td className="numeric">{order.testCount}</td>
              <td className="numeric">{formatCents(order.totalCents)}</td>
              <td className="nowrap">{formatDate(order.estimatedReadyDate)}</td>
              <td>
                <StatusBadge status={order.status} />
              </td>
              <td className="nowrap">
                {formatDateTime(order.createdAtClinic)}
              </td>
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

const ARROWS = { asc: '▲', desc: '▼' } as const;
const DIRECTION_WORDS = { asc: 'ascending', desc: 'descending' } as const;

// One sortable column header: a real button in the <th>, which carries
// aria-sort. The arrow is only a picture (aria-hidden): the direction is said
// by aria-sort and by the button's name.
function SortHeader({
  column,
  label,
  sort,
  refocusRef,
  onClick,
}: {
  column: OrderSort;
  label: string;
  sort: OrderSortState;
  refocusRef: { current: OrderSort | null };
  onClick: () => void;
}) {
  const active = sort.sort === column;
  return (
    <th
      scope="col"
      aria-sort={active ? DIRECTION_WORDS[sort.dir] : 'none'}
      className="sortable"
    >
      <button
        type="button"
        className="sort-button"
        aria-label={
          active
            ? `Sort by ${label}, now ${DIRECTION_WORDS[sort.dir]}`
            : `Sort by ${label}`
        }
        ref={(button) => {
          if (button && refocusRef.current === column) {
            refocusRef.current = null;
            button.focus();
          }
        }}
        onClick={onClick}
      >
        {label}
        <span aria-hidden="true" className="sort-arrow">
          {active ? ARROWS[sort.dir] : ''}
        </span>
      </button>
    </th>
  );
}

// The pages of orders for these filters in this order. The next page starts
// after the rows already loaded (offset paging); a new filter or sort is a
// new key, so it starts again from the first page.
function useOrders(filters: OrderFilters, sort: OrderSortState) {
  return useInfiniteQuery({
    queryKey: orderListKey(filters, sort),
    queryFn: ({ pageParam, signal }) =>
      fetchOrders(filters, sort, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore
        ? pages.reduce((count, page) => count + page.items.length, 0)
        : undefined,
  });
}
