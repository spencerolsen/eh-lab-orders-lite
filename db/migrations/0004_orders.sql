-- Orders and their items (LAB-11).
--
-- There is no total column: the total is the sum of the items' price_cents,
-- worked out by calculateTotal (src/server/orders/domain/) every time it is
-- shown. The ready date is the opposite: estimateReadyDate works it out once,
-- when the order is placed, and it is stored here.
--
-- Orders are never deleted (a cancelled order keeps its row, LAB-17), so the
-- foreign keys keep the default: a patient, an order or a lab test that is
-- pointed at cannot be deleted.
--
-- "An order has at least one item" is not checked here: a CHECK cannot look
-- at other rows. Placing an order (LAB-12) refuses an empty test list with a
-- 422, and estimateReadyDate throws on an empty list, so no code path can
-- store an order without items.
create table orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id),
  status text not null default 'ordered',
  estimated_ready_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The statuses are ORDER_STATUSES in src/shared/orders.ts; a test checks
  -- that this list and that one agree. To add one, see AGENTS.md.
  constraint orders_status_known check (
    status in ('ordered', 'collected', 'completed', 'cancelled')
  )
);

-- The list is read newest first, ties broken by id (GET /api/orders).
create index orders_created_at_id on orders (created_at desc, id desc);

-- One row per test on an order. Code, name, price and turnaround are copied
-- from lab_tests when the order is placed, so changing the catalog later
-- never changes an order that already exists.
create table order_items (
  order_id uuid not null references orders (id),
  lab_test_id uuid not null references lab_tests (id),
  test_code text not null,
  test_name text not null,
  price_cents integer not null,
  turnaround_days integer not null,
  -- A test appears at most once on an order.
  constraint order_items_pkey primary key (order_id, lab_test_id),
  constraint order_items_price_cents_not_negative check (price_cents >= 0),
  constraint order_items_turnaround_days_positive check (turnaround_days >= 1)
);
