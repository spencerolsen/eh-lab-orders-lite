import pg from 'pg';
import pino, { type DestinationStream, type Logger } from 'pino';

import type { Config } from './config';

// A Postgres error's message can repeat a submitted value (for example
// `invalid input syntax for type date: "..."`), and its `detail` repeats row
// values. So it is logged by its SQLSTATE code and the schema names involved,
// with the stack's first line (which is the message) replaced.
function serializeDatabaseError(error: pg.DatabaseError) {
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '));
  return {
    type: 'DatabaseError',
    code: error.code,
    constraint: error.constraint,
    table: error.table,
    column: error.column,
    stack: [`DatabaseError ${error.code ?? 'unknown'}`, ...frames].join('\n'),
  };
}

// Only these fields of an error are logged. The standard serializer copies
// every property, and those can hold row values.
function serializeError(error: unknown) {
  if (error instanceof pg.DatabaseError) return serializeDatabaseError(error);
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
