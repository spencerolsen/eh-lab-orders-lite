import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

export const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  '../../../db/migrations',
);

// 0001_description.sql: four digits, an underscore, then lower case letters,
// digits and underscores.
const FILE_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;

// A line that starts with a transaction statement, such as `begin;` or
// `commit work;`. (A PL/pgSQL block's `begin` has no semicolon after it, and
// its `end;` is not checked, so functions still pass.) This only looks at the
// start of each line; any other way a file ends the transaction is caught by
// fileEndedTransaction below.
const TRANSACTION_STATEMENT =
  /^\s*(begin|start\s+transaction|commit|rollback)(\s+(work|transaction))?\s*;/im;

// Refuses a pending file before it runs, with a message saying why.
function checkPendingFile(
  file: string,
  sql: string,
  newestApplied: string | undefined,
  allFiles: string[],
): void {
  if (!FILE_NAME.test(file)) {
    throw new Error(
      `Migration ${file} is not named like 0001_description.sql (four digits, an underscore, lower case letters, digits and underscores)`,
    );
  }
  const number = file.slice(0, 4);
  const twin = allFiles.find(
    (other) => other !== file && other.startsWith(number),
  );
  if (twin !== undefined) {
    throw new Error(
      `Migrations ${file} and ${twin} share the number ${number}: give one of them the next free number`,
    );
  }
  if (newestApplied !== undefined && file < newestApplied) {
    throw new Error(
      `Migration ${file} sorts before ${newestApplied}, which is already applied: give it the next free number (or, if the newer file came from another branch, run \`pnpm db:reset\`)`,
    );
  }
  if (TRANSACTION_STATEMENT.test(sql)) {
    throw new Error(
      `Migration ${file} contains its own begin, commit or rollback: remove it, because the runner already runs each file in a transaction`,
    );
  }
}

// True when the file has ended the runner's transaction itself (by a commit,
// rollback or abort in any form). Postgres refuses a savepoint outside a
// transaction block with code 25P01; inside one, even an aborted one, it
// gives no such error.
async function fileEndedTransaction(client: pg.ClientBase): Promise<boolean> {
  try {
    await client.query('savepoint migration_check');
    return false;
  } catch (error) {
    return (error as { code?: string }).code === '25P01';
  }
}

// Applies every .sql file in `dir` that is not yet recorded in schema_migrations,
// in filename order. Each file runs in its own transaction together with the
// row that records it, so a file is either fully applied and recorded, or not
// at all. Stops at the first failure. Returns the files it applied.
// Run one at a time: if two runs race, the second one fails with a
// duplicate-key error rather than apply a file twice.
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
  const newestApplied = [...alreadyApplied].sort().at(-1);

  const files = (await readdir(dir))
    .filter((file) => file.toLowerCase().endsWith('.sql'))
    .sort();
  const applied: string[] = [];

  for (const file of files) {
    if (alreadyApplied.has(file)) continue;

    const sql = await readFile(path.join(dir, file), 'utf8');
    checkPendingFile(file, sql, newestApplied, files);
    try {
      await client.query('begin');
      await client.query(sql);
      // Fails (and lands in the catch) if the file ended the transaction.
      await client.query('savepoint migration_file_done');
      await client.query(
        'insert into schema_migrations (filename) values ($1)',
        [file],
      );
      await client.query('commit');
    } catch (error) {
      if (await fileEndedTransaction(client)) {
        throw new Error(
          `Migration ${file} ended the runner's transaction itself (a commit, rollback or abort in the file). It was not recorded, and the database may be partly changed: run \`pnpm db:reset\``,
          { cause: error },
        );
      }
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
