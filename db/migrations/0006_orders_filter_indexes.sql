-- Indexes for the orders list filters (LAB-14), one per filter of
-- GET /api/orders. Each ends in (created_at desc, id desc), the list's own
-- order, so Postgres can read a filtered list already sorted and stop after
-- limit + 1 rows instead of sorting every matching row. The unfiltered list
-- is served by orders_created_at_id (0004_orders.sql).

-- The status filter:
--   where status = $1 order by created_at desc, id desc
create index orders_status_created_at_id
  on orders (status, created_at desc, id desc);

-- The patient filter (and the patient page's order history, LAB-19):
--   where patient_id = $1 order by created_at desc, id desc
create index orders_patient_id_created_at_id
  on orders (patient_id, created_at desc, id desc);

-- Both filters together use the patient index (a patient has few orders, so
-- checking the status on them is cheap); a third index for the pair would
-- cost every insert for nothing.
