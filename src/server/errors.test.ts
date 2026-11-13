import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { errorBodySchema } from '../shared/api-error';
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  ERROR_CODES,
  type ErrorCode,
  INTERNAL_ERROR_MESSAGE,
  NotFoundError,
  toErrorResponse,
  ValidationError,
} from './errors';

// Made-up codes, so these tests do not depend on which feature codes exist.
const CONFLICT_CODE = 'TEST_CONFLICT' as ErrorCode;
const RULE_CODE = 'TEST_RULE' as ErrorCode;

describe('toErrorResponse', () => {
  it.each([
    {
      error: new ValidationError([{ field: 'name', reason: 'is required' }]),
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'name', reason: 'is required' }],
    },
    {
      error: new NotFoundError('Patient not found'),
      statusCode: 404,
      code: 'NOT_FOUND',
    },
    {
      error: new ConflictError(CONFLICT_CODE, 'Already exists'),
      statusCode: 409,
      code: CONFLICT_CODE,
    },
    {
      error: new BusinessRuleError(RULE_CODE, 'Not allowed'),
      statusCode: 422,
      code: RULE_CODE,
    },
  ])(
    'error mapper turns each typed error into status, code and shape ($statusCode)',
    ({ error, statusCode, code, details }) => {
      expect(toErrorResponse(error, 'req-1')).toEqual({
        statusCode,
        body: {
          error: {
            code,
            message: error.message,
            ...(details ? { details } : {}),
            requestId: 'req-1',
          },
        },
        expected: true,
      });
    },
  );

  it.each([
    new ValidationError([{ field: 'name', reason: 'is required' }]),
    new BusinessRuleError(RULE_CODE, 'Not allowed'),
    new Error('unexpected'),
  ])(
    'builds a body the web client accepts as the standard shape (%#)',
    (error) => {
      const { body } = toErrorResponse(error, 'req-1');
      expect(errorBodySchema.parse(body)).toEqual(body);
    },
  );

  it('leaves out details when there are none', () => {
    const { body } = toErrorResponse(new ValidationError([]), 'req-1');
    expect(body.error).not.toHaveProperty('details');
  });

  it.each([
    new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'),
    'a thrown string',
    undefined,
    // A status code on an error that is not Fastify's own is not trusted.
    Object.assign(new Error('teapot'), { statusCode: 418, code: 'E_TEAPOT' }),
    // A Fastify error that is the server's fault is a 500 too.
    Object.assign(new Error('bad reply'), {
      statusCode: 500,
      code: 'FST_ERR_REP_INVALID_PAYLOAD_TYPE',
    }),
  ])('turns anything else into the generic 500 (%#)', (error) => {
    const result = toErrorResponse(error, 'req-2');
    expect(result).toEqual({
      statusCode: 500,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message: INTERNAL_ERROR_MESSAGE,
          requestId: 'req-2',
        },
      },
      expected: false,
    });
  });

  it.each([
    {
      fastify: 'FST_ERR_CTP_INVALID_JSON_BODY',
      status: 400,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    },
    {
      fastify: 'FST_ERR_CTP_BODY_TOO_LARGE',
      status: 413,
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
    },
    {
      fastify: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
      status: 415,
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    },
  ])(
    'maps the Fastify error $fastify to $statusCode $code with a fixed message',
    ({ fastify, status, statusCode, code }) => {
      const error = Object.assign(new Error('Unexpected token } in "secret"'), {
        code: fastify,
        statusCode: status,
      });
      const result = toErrorResponse(error, 'req-3');
      expect(result.statusCode).toBe(statusCode);
      expect(result.body.error.code).toBe(code);
      expect(result.body.error.message).not.toContain('secret');
      expect(result.expected).toBe(true);
    },
  );

  it('names the subclass on each typed error', () => {
    expect(new NotFoundError('x').name).toBe('NotFoundError');
    expect(new NotFoundError('x')).toBeInstanceOf(AppError);
  });
});

describe('the error-code registry', () => {
  it('holds only upper snake case codes, each once', () => {
    for (const code of ERROR_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
    }
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('matches the error-code table in docs/api.md', () => {
    const doc = readFileSync(
      path.resolve(import.meta.dirname, '../../docs/api.md'),
      'utf8',
    );
    // Rows of the table look like: | `NOT_FOUND` | 404 | ... |
    const documented = [...doc.matchAll(/^\| `([A-Z0-9_]+)` \|/gm)].map(
      (match) => match[1],
    );
    expect(documented.sort()).toEqual([...ERROR_CODES].sort());
  });
});
