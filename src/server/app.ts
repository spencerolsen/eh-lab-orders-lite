import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  LogController,
} from 'fastify';
import type pg from 'pg';

import {
  AppError,
  NotFoundError,
  toErrorResponse,
  ValidationError,
} from './errors';
import { catalogRoutes } from './catalog/routes';
import { healthRoutes } from './health/routes';
import { patientRoutes } from './patients/routes';
import { pickRequestId } from './request-id';

// Everything the app needs from outside. Production passes the real pool,
// () => new Date(), the clinic's time zone and the pino logger (main.ts);
// tests pass their own.
export type AppDeps = {
  pool: pg.Pool;
  clock: () => Date;
  // CLINIC_TIMEZONE: the clinic's calendar day decides what "today" is.
  clinicTimezone: string;
  logger: FastifyBaseLogger;
};

// One line per request: the route pattern (/api/patients/:id), never the raw
// URL, so no id or search text from the path or query string is logged. An
// unknown path has no pattern and is logged as '(unmatched)'.
function logCompleted(request: FastifyRequest, reply: FastifyReply): void {
  request.log.info(
    {
      event: 'request.completed',
      method: request.method,
      route: request.routeOptions.url ?? '(unmatched)',
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
    },
    'Request finished',
  );
}

// Builds the Fastify app without listening, so tests can call app.inject().
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    loggerInstance: deps.logger,
    logController: new LogController({
      // Fastify's own request lines log the URL and headers: logCompleted
      // below writes one line per request instead.
      disableRequestLogging: true,
      // Each request's log lines carry `requestId`, taken from a sane
      // incoming x-request-id header or newly generated.
      requestIdLogLabel: 'requestId',
    }),
    // While shutting down, Fastify would answer new requests with its own 503
    // body; the onRequest hook below answers them in the standard shape.
    return503OnClosing: false,
    genReqId: (req) => pickRequestId(req.headers['x-request-id']),
    // Errors Fastify finds before routing (a malformed URL, for example).
    // Its default reply repeats the URL; this one uses the standard shape.
    frameworkErrors: (error, request, reply) => {
      const { statusCode, body } = toErrorResponse(
        new ValidationError([], 'The request could not be read'),
        request.id,
      );
      request.log.warn(
        { event: 'request.rejected', code: body.error.code, statusCode },
        `Request rejected before routing (${error.code})`,
      );
      // The hooks do not run for these requests, so set the header and write
      // the completion line here.
      const sent = (reply as FastifyReply)
        .code(statusCode)
        .header('x-request-id', request.id)
        .send(body);
      logCompleted(request, sent);
    },
  });

  // The API takes JSON bodies only, so a text/plain body is a 415 like any
  // other type (Fastify would otherwise hand it to the route as a string).
  app.removeContentTypeParser('text/plain');

  // Set once app.close() starts (on SIGTERM or SIGINT): requests already
  // running finish, and any that arrive after this get a 503.
  let closing = false;
  app.addHook('preClose', (done) => {
    closing = true;
    done();
  });

  app.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
    if (closing) {
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'The server is restarting. Try again in a moment.',
      );
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    logCompleted(request, reply);
  });

  // The one place an error becomes a response. Expected errors (4xx) are
  // logged at warn with their code; anything else is a 500 with the generic
  // message, and its stack goes to the log at error level, never to the caller.
  app.setErrorHandler((error, request, reply) => {
    const { statusCode, body, expected } = toErrorResponse(error, request.id);
    if (expected) {
      request.log.warn(
        {
          event: 'request.rejected',
          code: body.error.code,
          statusCode,
          // A count only: field names can be keys the client chose (an
          // unknown field, a record key), and so can hold patient details.
          fieldCount: body.error.details?.length ?? 0,
        },
        `Request rejected: ${body.error.code}`,
      );
    } else {
      request.log.error(
        { event: 'request.failed', err: error },
        'Request failed with an unexpected error',
      );
    }
    return reply.code(statusCode).send(body);
  });

  // Unknown routes take the same path as every other error.
  app.setNotFoundHandler(() => {
    throw new NotFoundError('There is nothing at this address');
  });

  healthRoutes(app, deps.pool);
  // Feature routes. Each writes its full path (/api/...) and is added to this
  // app directly, not through app.register with a prefix: a registered plugin
  // makes app.close() reach the preClose hook above a few ticks later, and a
  // request arriving in between would run instead of getting the 503.
  catalogRoutes(app, deps.pool);
  patientRoutes(app, deps);

  return app;
}
