// `pnpm dev`: starts the whole app with one command.
//
//   1. Creates .env from .env.example when there is none, then checks every
//      setting (a missing or malformed one stops here with the config error).
//   2. Checks that Docker is running.
//   3. pnpm db:up (start Postgres, wait until healthy), db:migrate, db:seed.
//      The seed runs every time: each row has a fixed key and is inserted with
//      `on conflict do nothing`, so a second run inserts 0 rows.
//   4. Runs the API (pnpm dev:api, restarting on changes) and the web app
//      (pnpm dev:web, Vite) together, each output line prefixed [api] or [web].
//      Ctrl-C stops both; if either one exits, the other is stopped too.
//
// The two processes are started here with child_process rather than through a
// package such as concurrently: it is a few lines, and what Ctrl-C does stays
// visible in this file.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { loadConfig } from '../src/server/config';

function say(line: string): void {
  console.log(`dev: ${line}`);
}

// pnpm sets npm_execpath to its own entry point when it runs a script, so the
// steps below run with the same pnpm, even when it came through Corepack.
function pnpmCommand(args: string[]): [string, string[]] {
  const pnpm = process.env.npm_execpath;
  return pnpm ? [process.execPath, [pnpm, ...args]] : ['pnpm', args];
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
// port goes to both children, so the API listens where the proxy points.
const { PORT } = loadConfig();
process.env.PORT = String(PORT);

// 2. Docker.
if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
  console.error(
    'dev: Docker is not running. Start Docker, then run pnpm dev again.',
  );
  process.exit(1);
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
    // Colours are kept even though the output goes through a pipe.
    env: { ...process.env, FORCE_COLOR: '1' },
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

// Sends the signal to each child's whole process group. The API answers
// SIGINT and SIGTERM with its graceful shutdown; Vite exits on either.
function stop(signal: NodeJS.Signals): void {
  stopping = true;
  for (const child of children) {
    if (child.pid === undefined) continue;
    try {
      process.kill(-child.pid, signal);
    } catch {
      // The group has already exited.
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
