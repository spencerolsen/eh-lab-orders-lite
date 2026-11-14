-- Indexes for the duplicate-patient check (LAB-10), one per rule of the
-- candidate query in src/server/patients/repo.ts (findDuplicateCandidates),
-- each on the exact expression that query compares. Every create runs that
-- query, so these keep it a lookup instead of a scan as the table grows; at a
-- few hundred rows Postgres scans the table anyway, which is just as fast.
--
-- Plain indexes, not unique ones: the check warns and never blocks, because
-- two real people can share an email, a phone, or a name and birthday.
create index patients_email_lower_idx on patients (lower(email));
create index patients_phone_idx on patients (phone);
create index patients_name_dob_idx
  on patients (lower(first_name), lower(last_name), date_of_birth);
