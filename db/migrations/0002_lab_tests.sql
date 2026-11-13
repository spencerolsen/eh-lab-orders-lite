-- The lab test catalog (LAB-06). The database repeats the rules the request
-- schema checks (src/shared/lab-tests.ts), so a row written any other way
-- (a script, a later bug) cannot break them either.
create table lab_tests (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  price_cents integer not null,
  turnaround_days integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Named, so the repository can recognise this violation and answer 409.
  constraint lab_tests_code_key unique (code),
  -- Codes are stored upper case, so the unique constraint is case-insensitive.
  constraint lab_tests_code_upper check (code = upper(code)),
  constraint lab_tests_code_not_blank check (btrim(code) <> ''),
  constraint lab_tests_name_not_blank check (btrim(name) <> ''),
  constraint lab_tests_price_cents_not_negative check (price_cents >= 0),
  constraint lab_tests_turnaround_days_positive check (turnaround_days >= 1)
);
