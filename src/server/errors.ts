// The typed application errors, the error-code registry, and the one function
// that turns any thrown value into a status code and the standard error body.
import type {
  ErrorBody as SharedErrorBody,
  FieldProblem,
} from '../shared/api-error';
import type { Patient } from '../shared/patients';

// Every error code the API can return, in upper snake case. Later tasks add
// their own codes here and to the error-code table in docs/api.md.
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
  'DUPLICATE_TEST_CODE',
  'CONTACT_REQUIRED',
  'POSSIBLE_DUPLICATE',
  'INVALID_ORDER_TESTS',
  'UNKNOWN_PATIENT',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// The standard error body, defined once in src/shared/api-error.ts, with the
// code narrowed to the codes registered here.
export type { FieldProblem };
export type ErrorBody = {
  error: SharedErrorBody['error'] & { code: ErrorCode };
};

// The base class: an error the API expects and reports to the caller as is.
// The message is shown to the user, so it holds no patient details.
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldProblem[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

// 400: the input is malformed or has the wrong shape (including unknown fields).
export class ValidationError extends AppError {
  constructor(details: FieldProblem[], message = 'The request is not valid') {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

// 404: the resource named in the URL path does not exist.
export class NotFoundError extends AppError {
  constructor(message: string, code: ErrorCode = 'NOT_FOUND') {
    super(404, code, message);
  }
}

// 409: the request conflicts with the current state, for example a duplicate code.
export class ConflictError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(409, code, message);
  }
}

// 409 POSSIBLE_DUPLICATE: a new patient looks like existing ones (LAB-10).
// Nothing was created; `matches` goes to the caller as `error.matches`, so the
// user can open one of them or send the request again with confirmDuplicate.
export class PossibleDuplicateError extends ConflictError {
  constructor(readonly matches: Patient[]) {
    super(
      'POSSIBLE_DUPLICATE',
      'This patient may already exist. Open the existing patient, or create a new one anyway.',
    );
  }
}

// 422: the input has the right shape but breaks a business rule, or an id
// inside the request body does not exist.
export class BusinessRuleError extends AppError {
  constructor(code: ErrorCode, message: string, details?: FieldProblem[]) {
    super(422, code, message, details);
  }
}

export const INTERNAL_ERROR_MESSAGE = 'Something went wrong on our side';

// Errors Fastify itself throws while reading a request (malformed JSON, a body
// that is too large, an unsupported content type) have a code starting FST_
// and a 4xx status. Their own messages can repeat parts of the request, so each
// gets a fixed message here instead.
function fromFastifyClientError(statusCode: number): AppError {
  if (statusCode === 413) {
    return new AppError(
      413,
      'PAYLOAD_TOO_LARGE',
      'The request body is too large',
    );
  }
  if (statusCode === 415) {
    return new AppError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'The request body must be JSON',
    );
  }
  return new ValidationError([], 'The request could not be read');
}

function isFastifyClientError(
  error: unknown,
): error is { code: string; statusCode: number } {
  const { code, statusCode } = (error ?? {}) as {
    code?: unknown;
    statusCode?: unknown;
  };
  return (
    typeof code === 'string' &&
    code.startsWith('FST_') &&
    typeof statusCode === 'number' &&
    statusCode >= 400 &&
    statusCode < 500
  );
}

// Turns anything thrown while handling a request into what the caller sees.
// `expected` is false for a 500: the caller gets the generic message, and the
// server logs the original error with its stack.
export function toErrorResponse(
  error: unknown,
  requestId: string,
): { statusCode: number; body: ErrorBody; expected: boolean } {
  let known: AppError | undefined;
  if (error instanceof AppError) known = error;
  else if (isFastifyClientError(error)) {
    known = fromFastifyClientError(error.statusCode);
  }

  if (known === undefined) {
    return {
      statusCode: 500,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message: INTERNAL_ERROR_MESSAGE,
          requestId,
        },
      },
      expected: false,
    };
  }
  return {
    statusCode: known.statusCode,
    body: {
      error: {
        code: known.code,
        message: known.message,
        ...(known.details && known.details.length > 0
          ? { details: known.details }
          : {}),
        ...(known instanceof PossibleDuplicateError
          ? { matches: known.matches }
          : {}),
        requestId,
      },
    },
    expected: true,
  };
}
