-- Double-submit protection for POST /api/orders (LAB-18). The browser sends
-- a random key (a uuid) with each attempt to place an order; the order keeps
-- it here. Orders placed before this file, and requests sent without a key,
-- keep a null.
alter table orders add column idempotency_key text;

-- One order per key. Nulls are distinct in a unique index, so any number of
-- orders may have no key. Not partial: the insert's
-- `on conflict (idempotency_key) do nothing` names this column and needs a
-- plain unique index on it.
create unique index orders_idempotency_key on orders (idempotency_key);
