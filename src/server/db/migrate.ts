import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

export const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  '../../../db/migrations',
);

// Applies every .sql file in `dir` that is not yet recorded in schema_migrations,
// in filename order. Each file runs in its own transaction together with the
// row that records it, so a file is either fully applied and recorded, or not
// at all. Stops at the first failure. Returns the files it applied.
export async function migrate(
  client: pg.ClientBase,
  dir = MIGRATIONS_DIR,
  log: (line: string) => void = console.log,
): Promise<string[]> {
  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await client.query<{ filename: string }>(
    'select filename from schema_migrations',
  );
  const alreadyApplied = new Set(rows.map((row) => row.filename));

  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const applied: string[] = [];

  for (const file of files) {
    if (alreadyApplied.has(file)) continue;

    const sql = await readFile(path.join(dir, file), 'utf8');
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into schema_migrations (filename) values ($1)',
        [file],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Migration ${file} failed and was rolled back`, {
        cause: error,
      });
    }

    log(`applied ${file}`);
    applied.push(file);
  }

  log(`${applied.length} migration file(s) applied`);
  return applied;
}

// Drops everything in the public schema (tables, data, the migration records)
// and creates it again empty. Only the reset commands call this.
export async function resetSchema(client: pg.ClientBase): Promise<void> {
  await client.query('drop schema public cascade');
  await client.query('create schema public');
}
