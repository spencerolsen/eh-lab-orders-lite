import { z } from 'zod';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

function isPostgresUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === 'postgres:' || protocol === 'postgresql:';
}

function isKnownTimeZone(value: string): boolean {
  return Intl.supportedValuesOf('timeZone').includes(value);
}

// Every reason below is fixed text: no reason ever repeats the value it was
// given, because DATABASE_URL may hold a password.
const configSchema = z.object({
  DATABASE_URL: z
    .string({ error: 'is required' })
    .refine(isPostgresUrl, 'must be a valid postgres:// or postgresql:// URL'),
  PORT: z.coerce
    .number({ error: 'must be a whole number' })
    .int('must be a whole number')
    .min(1, 'must be between 1 and 65535')
    .max(65535, 'must be between 1 and 65535')
    .default(3000),
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
