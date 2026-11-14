// `pnpm test:e2e`: runs the browser tests (e2e/) with one command.
//
//   1. Reads .env, checks the settings and that the database URLs use DB_PORT.
//   2. Checks that Docker runs and that the API's port (PORT) and the web
//      app's port (WEB_PORT) are different and free, each with one line. It
//      never reuses a server that is already there: a `pnpm dev` on other
//      ports is left alone, and on these ports the run stops.
//   3. Starts the database container, creates the e2e database (lab_orders_e2e,
//      its own, never the development or the integration tests' one) if it is
//      missing, then drops and recreates its tables, migrates and seeds it.
//      Every run starts from the same rows.
//   4. Starts the API and the web app (Vite) on those ports against that
//      database, waits until the app answers, runs Playwright and passes on
//      its arguments (for example `pnpm test:e2e -g "double click"`).
//   5. Stops the API and the web app, whatever the result, and exits with
//      Playwright's exit code. The database container is left running, as
//      after `pnpm test`.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { loadConfig } from '../src/server/config';
import {
  assertResettable,
  checkDatabasePort,
  databaseName,
  e2eDatabaseUrl,
} from '../src/server/db/guards';
import { migrate, resetSchema } from '../src/server/db/migrate';
import { withClient } from '../src/server/db/script';
import { portInUse } from './ports';

function fail(message: string): never {
  console.error(`test:e2e: ${message}`);
  process.exit(1);
}

// The same pnpm that started this script (see scripts/dev.ts).
function pnpmCommand(args: string[]): [string, string[]] {
  const pnpm = process.env.npm_execpath;
  return pnpm
    ? [process.execPath, [pnpm, ...args]]
    : ['corepack', ['pnpm', ...args]];
}

function run(args: string[], env: NodeJS.ProcessEnv): number {
  const [command, rest] = pnpmCommand(args);
  return spawnSync(command, rest, { stdio: 'inherit', env }).status ?? 1;
}

// 1. Settings.
if (!existsSync('.env')) {
  fail('there is no .env file: run `cp .env.example .env` first.');
}
process.loadEnvFile('.env');
const { PORT, WEB_PORT } = loadConfig();
try {
  checkDatabasePort(process.env);
} catch (error) {
  fail((error as Error).message);
}
const e2eUrl = e2eDatabaseUrl(process.env);
// The reset below only ever runs on a database of this project's own.
assertResettable(e2eUrl, process.env.NODE_ENV);
if (!databaseName(e2eUrl).endsWith('_e2e')) {
  fail('the e2e database name must end in _e2e.');
}

// 2. Docker and ports.
if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
  fail('Docker is not running. Start Docker, then try again.');
}
if (PORT === WEB_PORT) {
  fail(`PORT and WEB_PORT are both ${PORT}: they must differ (see .env).`);
}
for (const [port, what] of [
  [PORT, 'the API (PORT in .env)'],
  [WEB_PORT, 'the web app (WEB_PORT in .env)'],
] as const) {
  for (const host of ['127.0.0.1', '::1']) {
    if (await portInUse(port, host)) {
      fail(
        `port ${port}, needed by ${what}, is in use. Stop what is using it, or change it in .env, then try again.`,
      );
    }
  }
}

// 3. The e2e database.
const env: NodeJS.ProcessEnv = {
  ...process.env,
  // The API, the seed and Playwright all see the e2e database as "the" database.
  DATABASE_URL: e2eUrl,
  PORT: String(PORT),
  WEB_PORT: String(WEB_PORT),
  LOG_LEVEL: 'warn',
  // Not `development`, so the server logs JSON lines instead of loading pino-pretty.
};
if (run(['--silent', 'run', 'db:up'], env) !== 0)
  fail('could not start the database.');
// CREATE DATABASE cannot run inside the database it creates, so connect to the
// server's own `postgres` database for that one statement.
const maintenance = new URL(e2eUrl);
maintenance.pathname = '/postgres';
await withClient(maintenance.toString(), async (client) => {
  const { rowCount } = await client.query(
    'select 1 from pg_database where datname = $1',
    [databaseName(e2eUrl)],
  );
  if (rowCount === 0) {
    await client.query(`create database ${databaseName(e2eUrl)}`);
  }
});
await withClient(e2eUrl, async (client) => {
  await resetSchema(client);
  await migrate(client, undefined, () => {});
});
if (run(['--silent', 'exec', 'tsx', 'db/seed.ts'], env) !== 0) {
  fail('could not seed the e2e database.');
}

// 4. The API and the web app.
const children: ChildProcess[] = [];
let childExited: string | undefined;

function start(name: string, args: string[]): void {
  const [command, rest] = pnpmCommand(args);
  const child = spawn(command, rest, {
    // Its own process group, so stopping reaches pnpm, tsx and node.
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    env,
  });
  child.on('exit', () => {
    childExited ??= name;
  });
  children.push(child);
}

// Stops the web app first, then the API: the other way round, Vite would log
// a refused connection to the API it forwards to.
async function stopAll(): Promise<void> {
  for (const child of [...children].reverse()) {
    if (child.exitCode !== null || child.pid === undefined) continue;
    const pid = child.pid;
    const exited = new Promise<void>((resolve) => child.once('exit', resolve));
    // SIGKILL for the whole group if it has not stopped after 10 seconds.
    const timer = setTimeout(() => process.kill(-pid, 'SIGKILL'), 10_000);
    process.kill(-pid, 'SIGTERM');
    await exited;
    clearTimeout(timer);
  }
}

// Ctrl-C stops the servers too.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void stopAll().then(() => process.exit(130));
  });
}

async function waitUntilUp(): Promise<void> {
  // /healthz through Vite reaches the API, so one answer proves both.
  const url = `http://localhost:${WEB_PORT}/healthz`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (childExited) {
      throw new Error(`the ${childExited} stopped before the app was up.`);
    }
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`the app did not answer at ${url} within 60 seconds.`);
}

let code: number;
try {
  start('API', ['--silent', 'exec', 'tsx', 'src/server/main.ts']);
  start('web app', ['--silent', 'exec', 'vite', '--logLevel', 'warn']);
  await waitUntilUp();
  code = run(['exec', 'playwright', 'test', ...process.argv.slice(2)], env);
} catch (error) {
  // Reported after the finally below has stopped the servers: exiting here
  // (as fail() does) would leave the one that is still running behind.
  console.error(`test:e2e: ${(error as Error).message}`);
  code = 1;
} finally {
  await stopAll();
}
process.exit(code);
