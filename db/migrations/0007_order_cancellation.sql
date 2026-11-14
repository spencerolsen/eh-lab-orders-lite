-- Cancelling an order (LAB-17): why, who and when, kept on the order itself.
-- A cancelled order is never deleted and its items stay as they were.
--
-- The three columns are set together, by the one UPDATE that cancels an order
-- (src/server/orders/repo.ts), and the CHECK below holds every row to that,
-- however it is written: a cancelled order has a note, a name and a time, and
-- the note and the name are not blank; any other order has none of the three.
-- The API trims and checks the note and the name first (src/shared/orders.ts);
-- this is the backstop for any other way into the table. btrim removes spaces
-- only, so a note of other whitespace alone is refused by the API, not here.
-- No existing row is cancelled (the LAB-11 seed has none), so every row
-- already passes.
alter table orders
  add column cancellation_note text,
  add column cancelled_by text,
  add column cancelled_at timestamptz,
  add constraint orders_cancellation_complete check (
    (
      status = 'cancelled'
      and cancellation_note is not null and btrim(cancellation_note) <> ''
      and cancelled_by is not null and btrim(cancelled_by) <> ''
      and cancelled_at is not null
    )
    or (
      status <> 'cancelled'
      and cancellation_note is null
      and cancelled_by is null
      and cancelled_at is null
    )
  );
