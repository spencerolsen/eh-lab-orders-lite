# Data model

The database tables, their columns and the rules the database itself enforces.

Each task that adds a table documents it here.

## Tables

### `schema_migrations`

The migration runner's bookkeeping: one row per applied file in `db/migrations/`. The runner creates it if it is missing. There are no business tables yet; the first, the lab test catalog, arrives in LAB-06.

| Column | Type | Rules |
|---|---|---|
| `filename` | `text` | Primary key. The migration file's name, for example `0001_baseline.sql`. |
| `applied_at` | `timestamptz` | Not null, defaults to `now()`. |

## Rules for every table

- **Calendar days are `date` columns, read as `YYYY-MM-DD` strings.** A date of birth or a ready date is a day, not a moment. The `DATE` type parser (`src/server/db/types.ts`) keeps Postgres's string as it is; without it, `pg` would build a JavaScript `Date` at local midnight, and the day could shift depending on the server's time zone.
- **A `date[]` (for example from `array_agg`) still comes back as JavaScript `Date`s**, because only the single `DATE` type has a parser. Select dates one per row instead.
- **Money is whole cents in integer columns** (`price_cents`, `total_cents`).
