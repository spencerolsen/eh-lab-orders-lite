import { z } from 'zod';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

// A postgres:// or postgresql:// URL with a host and a database name.
function isPostgresUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const { protocol, hostname, pathname } = new URL(value);
  return (
    (protocol === 'postgres:' || protocol === 'postgresql:') &&
    hostname !== '' &&
    pathname.length > 1
  );
}

// A time zone the runtime knows, such as UTC or America/Denver: the formatter
// throws a RangeError for any other name. It also accepts offsets such as
// +05:00, which are not zone names, so those are refused first.
function isKnownTimeZone(value: string): boolean {
  if (/^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const PORT_RANGE = 'must be between 1 and 65535';

// Digits only, so values such as 1e3, 0x50 or 3000.0 are refused.
function portSetting(defaultPort: number) {
  return z
    .string()
    .regex(/^\d+$/, 'must be a whole number')
    .transform(Number)
    .pipe(z.number().min(1, PORT_RANGE).max(65535, PORT_RANGE))
    .default(defaultPort);
}

// Every reason below is fixed text: no reason ever repeats the value it was
// given, because DATABASE_URL may hold a password.
const configSchema = z.object({
  DATABASE_URL: z
    .string({ error: 'is required' })
    .refine(
      isPostgresUrl,
      'must be a postgres:// or postgresql:// URL with a host and a database name',
    ),
  PORT: portSetting(3000),
  // The web app's port (Vite). Only `pnpm dev` and vite.config.ts use it; it
  // is checked here so a malformed value stops `pnpm dev` with the config error.
  WEB_PORT: portSetting(5173),
  LOG_LEVEL: z
    .enum(LOG_LEVELS, { error: `must be one of ${LOG_LEVELS.join(', ')}` })
    .default('info'),
  CLINIC_TIMEZONE: z
    .string()
    .refine(
      isKnownTimeZone,
      'must be an IANA time zone name, for example America/Denver',
    )
    .default('America/Denver'),
});

export type Config = Readonly<z.infer<typeof configSchema>>;

export type ConfigProblem = { setting: string; reason: string };

export type ConfigResult =
  { ok: true; config: Config } | { ok: false; problems: ConfigProblem[] };

export function parseConfig(
  env: Record<string, string | undefined>,
): ConfigResult {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => ({
      setting: issue.path.join('.'),
      reason: issue.message,
    }));
    return { ok: false, problems };
  }
  return { ok: true, config: Object.freeze(result.data) };
}

// Reads the settings once at startup. On any missing or invalid setting it
// writes one JSON line at error level and exits with code 1, before the
// program does anything else.
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  const result = parseConfig(env);
  if (!result.ok) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'config.invalid',
        problems: result.problems,
      }),
    );
    process.exit(1);
  }
  return result.config;
}
