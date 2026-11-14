// `pnpm dev`: starts the whole app with one command.
//
//   1. Creates .env from .env.example when there is none, then checks every
//      setting (a missing or malformed one stops here with the config error).
//   2. Checks that the database URLs use the container's port (DB_PORT), that
//      Docker is running, and that the API's port (PORT) and Vite's port
//      (WEB_PORT) are different and both free. Each check stops with one line.
//   3. pnpm db:up (start Postgres, wait until healthy), db:migrate, db:seed.
//      The seed runs every time: each row has a fixed key and is inserted with
//      `on conflict do nothing`, so a second run inserts 0 rows.
//   4. Runs the API (pnpm dev:api, restarting on changes) and the web app
//      (pnpm dev:web, Vite) together, each output line prefixed [api] or [web].
//      Ctrl-C stops both. If either process exits, the other is stopped too.
//      A crash of the API itself does not count: `tsx watch` stays up waiting
//      for a file change (saving the fix restarts it), so the app keeps
//      running until Ctrl-C. That is why the ports are checked first.
//
// The two processes are started here with child_process rather than through a
// package such as concurrently: it is a few lines, and what Ctrl-C does stays
// visible in this file.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { loadConfig } from '../src/server/config';
import { checkDatabasePort } from '../src/server/db/guards';
import { portInUse } from './ports';

function say(line: string): void {
  console.log(`dev: ${line}`);
}

// pnpm sets npm_execpath to its own entry point when it runs a script, so the
// steps below run with the same pnpm, whether it was started as `pnpm dev` or
// as `corepack pnpm dev` (with no `pnpm` command on the PATH). Run directly
// (`tsx scripts/dev.ts`), it goes through Corepack, which needs no PATH entry.
function pnpmCommand(args: string[]): [string, string[]] {
  const pnpm = process.env.npm_execpath;
  return pnpm
    ? [process.execPath, [pnpm, ...args]]
    : ['corepack', ['pnpm', ...args]];
}

// Runs one step to the end, with its output shown as is; stops on a failure.
function step(script: string): void {
  const [command, args] = pnpmCommand(['--silent', 'run', script]);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    say(`pnpm ${script} failed, so the app was not started.`);
    process.exit(result.status ?? 1);
  }
}

// 1. Settings.
if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  say('no .env file, so copied .env.example to .env');
}
process.loadEnvFile('.env');
// On a missing or malformed setting: one JSON error line, exit 1. The checked
// ports go to both children, so the API listens where the proxy points and
// Vite listens where the checks below looked.
const { PORT, WEB_PORT } = loadConfig();
process.env.PORT = String(PORT);
process.env.WEB_PORT = String(WEB_PORT);
// A URL on another port than the container would reach another database (for
// example another copy of the project's), so stop before starting anything.
try {
  checkDatabasePort(process.env);
} catch (error) {
  console.error(`dev: ${(error as Error).message}`);
  process.exit(1);
}

// 2. Docker.
if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
  console.error('dev: Docker is not running. Start Docker, then try again.');
  process.exit(1);
}

// 2b. The two ports, before anything is started: otherwise the API would fail
// to listen while `tsx watch` and Vite kept running. Both free is not enough
// if they are the same port: Vite would take it first.
if (PORT === WEB_PORT) {
  console.error(
    `dev: PORT and WEB_PORT are both ${PORT}, but the API and the web app (Vite) need different ports. Change one of them in .env (a value set in your shell overrides .env).`,
  );
  process.exit(1);
}
for (const [port, what] of [
  [PORT, 'the API (PORT in .env)'],
  [WEB_PORT, 'the web app (WEB_PORT in .env)'],
] as const) {
  for (const host of ['127.0.0.1', '::1']) {
    if (await portInUse(port, host)) {
      console.error(
        `dev: port ${port}, needed by ${what}, is in use. Stop what is using it, then try again.`,
      );
      process.exit(1);
    }
  }
}

// 3. The database.
step('db:up');
step('db:migrate');
step('db:seed');

// 4. The API and the web app.
const children: ChildProcess[] = [];
let stopping = false;

function start(name: string, script: string): void {
  const [command, args] = pnpmCommand(['--silent', 'run', script]);
  const child = spawn(command, args, {
    // Its own process group, so stop() reaches everything it started
    // (pnpm, tsx and node), not just its first process.
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    // The output goes through a pipe, so the children would drop their
    // colours; keep them only when this script writes to a terminal.
    env: process.stdout.isTTY
      ? { ...process.env, FORCE_COLOR: '1' }
      : process.env,
  });
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    createInterface({ input: stream }).on('line', (line) => {
      console.log(`[${name}] ${line}`);
    });
  }
  child.on('exit', (code) => {
    children.splice(children.indexOf(child), 1);
    if (!stopping) {
      say(`${name} stopped (exit code ${code ?? 'none'}), stopping the rest.`);
      process.exitCode = 1;
      stop('SIGTERM');
    }
    if (children.length === 0) process.exit();
  });
  children.push(child);
}

// SIGTERM goes to each child (pnpm) only, which passes it on, so the API gets
// it once, through `tsx watch`, and shuts down gracefully. SIGKILL goes to
// each child's whole process group, so nothing is left behind.
function stop(signal: NodeJS.Signals): void {
  stopping = true;
  for (const child of children) {
    if (child.pid === undefined) continue;
    try {
      if (signal === 'SIGKILL') process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      // It has already exited.
    }
  }
}

// The first Ctrl-C (or SIGTERM) asks both to stop; a second one forces them.
let signals = 0;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    signals += 1;
    stop(signals === 1 ? 'SIGTERM' : 'SIGKILL');
  });
}

start('api', 'dev:api');
start('web', 'dev:web');
