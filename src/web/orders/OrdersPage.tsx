import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { ORDER_STATUS_LABELS, ORDER_STATUSES } from '../../shared/orders';
import { type OrderFilters, readFilters, writeFilters } from './filters';
import { OrderDetailPanel, useOpenOrderId } from './OrderDetailPanel';
import { NewOrderModal } from './NewOrderModal';
import { OrdersTable } from './OrdersTable';
import { PatientFilter } from './PatientFilter';

// The home page: the orders, newest first, as the server sends them, a page
// at a time ("Load more"), narrowed by the status and patient filters kept in
// the address (?status=...&patientId=...; see filters.ts); the table is the
// shared OrdersTable. "Place new order" opens the New order
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
  const [filters, setFilters] = useFilters();
  return (
    <OrdersTable
      filters={filters}
      showPatient
      onClearFilters={() => setFilters({})}
    />
  );
}
