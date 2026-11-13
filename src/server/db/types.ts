import pg from 'pg';

// Postgres type id for DATE.
const DATE_TYPE_ID = 1082;

// By default `pg` turns a DATE into a JavaScript Date at local midnight, which
// can shift the calendar day when the server's time zone is not UTC. A DATE is
// a calendar day, so keep the raw 'YYYY-MM-DD' string Postgres sends.
pg.types.setTypeParser(DATE_TYPE_ID, (value: string) => value);
