-- Index for the orders list sorted by ready date (LAB-26):
--   order by estimated_ready_date asc|desc, id asc|desc limit n
-- EXPLAIN on 5,000 orders showed Postgres reading this index (forward for
-- asc, backward for desc) and stopping after limit + 1 rows, where without it
-- it read every row and kept the top n (a seq scan and a top-N sort). With a
-- status filter the planner also walked this index and filtered as it went;
-- with a patient filter it keeps the patient index and sorts that patient's
-- few orders. The status and patient sorts have no index: they may read every
-- matching order (docs/plan/backlog.md).
create index orders_estimated_ready_date_id
  on orders (estimated_ready_date, id);
