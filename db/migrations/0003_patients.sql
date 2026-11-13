-- Patients (LAB-08). The precise rules (names trimmed, a real date of birth
-- not after the clinic's today, email or phone, a US phone stored as its 10
-- digits, email in lower case) are in the shared schema, src/shared/patients.ts. These checks
-- are the backstop for any row that does not come through it.
--
-- The date of birth check is deliberately loose: the database's current_date
-- is in UTC, which can be a day ahead of the clinic, so `+ 1` keeps it from
-- ever rejecting a date the clinic-timezone check accepts.
create table patients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_first_name_not_blank check (btrim(first_name) <> ''),
  constraint patients_last_name_not_blank check (btrim(last_name) <> ''),
  constraint patients_contact_required check (email is not null or phone is not null),
  constraint patients_phone_ten_digits check (phone ~ '^[0-9]{10}$'),
  constraint patients_email_lower_case check (email = lower(email)),
  constraint patients_date_of_birth_not_future check (date_of_birth <= current_date + 1)
);
