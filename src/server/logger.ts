import pino, { type DestinationStream, type Logger } from 'pino';

import type { Config } from './config';

// Only these fields of an error are logged. The standard serializer copies
// every property, and a Postgres error's `detail` can repeat the row's values.
function serializeError(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) };
  const { code } = error as { code?: unknown };
  return {
    type: error.name,
    message: error.message,
    ...(typeof code === 'string' ? { code } : {}),
    stack: error.stack,
  };
}

export type LoggerOptions = {
  level: Config['LOG_LEVEL'];
  // Readable, coloured lines through pino-pretty (a dev dependency): only for
  // development. Everywhere else each line is one JSON object.
  pretty?: boolean;
  // Where JSON lines go; standard output by default. Tests pass their own.
  destination?: DestinationStream;
};

export function createLogger(options: LoggerOptions): Logger {
  return pino(
    {
      level: options.level,
      // No pid or hostname on each line: one process, and a host name can be
      // a person's name.
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      serializers: { err: serializeError },
      ...(options.pretty ? { transport: { target: 'pino-pretty' } } : {}),
    },
    options.pretty ? undefined : options.destination,
  );
}
