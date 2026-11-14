// The one way the web app calls the API. On success it returns the parsed JSON
// body (callers check it with the shared response schema); on any failure it
// throws an ApiError, so screens handle a single kind of error.
import { errorBodySchema, type FieldProblem } from '../../shared/api-error';
import type { Patient } from '../../shared/patients';

// The code for a failure that did not come with the standard error body: the
// request never got an answer (the network, or the Vite dev server with the
// API stopped), or the answer was not the API's (a 502 from the proxy, an HTML
// page, an empty body). It is the client's own code, not one the API returns.
export const UNREACHABLE_CODE = 'SERVER_UNREACHABLE';
export const UNREACHABLE_MESSAGE = "Can't reach the server. Try again.";

export class ApiError extends Error {
  constructor(
    // The HTTP status, or 0 when no response arrived at all.
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details?: FieldProblem[],
    // Only on 409 POSSIBLE_DUPLICATE: the existing patients that match.
    readonly matches?: Patient[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function unreachable(status: number): ApiError {
  return new ApiError(status, UNREACHABLE_CODE, UNREACHABLE_MESSAGE);
}

// JSON.parse, but undefined instead of throwing for text that is not JSON.
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export type ApiFetchOptions = {
  method?: string;
  // Sent as JSON when present.
  body?: unknown;
  // TanStack Query passes one, to cancel a request nobody waits for any more.
  signal?: AbortSignal;
  // Extra request headers (the Idempotency-Key of placing an order).
  headers?: Record<string, string>;
  // Give up after this many milliseconds, with the same ApiError as a server
  // that cannot be reached. Only placing an order uses it (LAB-18).
  timeoutMs?: number;
};

export async function apiFetch(
  path: string,
  { method = 'GET', body, signal, headers, timeoutMs }: ApiFetchOptions = {},
): Promise<unknown> {
  // The timeout aborts the request as a cancel would, but is reported below
  // as "can't reach the server". A plain timer, not AbortSignal.timeout, so
  // tests can run it on fake timers.
  const timeout = timeoutMs === undefined ? undefined : new AbortController();
  const timer = timeout && setTimeout(() => timeout.abort(), timeoutMs);
  let response: Response;
  let text: string;
  try {
    response = await fetch(path, {
      method,
      signal:
        signal && timeout
          ? AbortSignal.any([signal, timeout.signal])
          : (signal ?? timeout?.signal),
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    text = await response.text();
  } catch (error) {
    // A cancelled request is not a failure to show: let the abort through.
    // A timeout is: it falls through to the "can't reach the server" error.
    if (signal?.aborted) throw error;
    throw unreachable(0);
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) {
    if (text === '') return undefined; // 204 No Content
    const json = parseJson(text);
    if (json === undefined) throw unreachable(response.status);
    return json;
  }

  const parsed = errorBodySchema.safeParse(parseJson(text));
  if (!parsed.success) throw unreachable(response.status);
  const { code, message, requestId, details, matches } = parsed.data.error;
  throw new ApiError(
    response.status,
    code,
    message,
    requestId,
    details,
    matches,
  );
}
