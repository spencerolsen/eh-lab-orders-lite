// The lab test catalog routes, added to the app in app.ts. No service
// layer: each route parses its input and calls one repository function, and
// the only rule beyond the input's shape (a unique code) is the database's.
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { createLabTestBody } from '../../shared/lab-tests';
import { withQueryLog } from '../db/query';
import { ConflictError } from '../errors';
import { parse } from '../parse';
import { createLabTest, listLabTests } from './repo';

export function catalogRoutes(app: FastifyInstance, pool: pg.Pool): void {
  // GET /api/lab-tests: every test, inactive ones included, sorted by code.
  app.get('/api/lab-tests', async (request) =>
    listLabTests(withQueryLog(pool, request.log)),
  );

  // POST /api/lab-tests: 201 with the new test, 409 DUPLICATE_TEST_CODE.
  app.post('/api/lab-tests', async (request, reply) => {
    const body = parse(createLabTestBody, request.body);
    try {
      const labTest = await createLabTest(
        withQueryLog(pool, request.log),
        body,
      );
      request.log.info(
        { event: 'lab_test.created', labTestId: labTest.id },
        'Lab test created',
      );
      return await reply.code(201).send(labTest);
    } catch (error) {
      if (error instanceof ConflictError) {
        // Without the code itself: nothing from the request body is logged.
        request.log.warn(
          { event: 'lab_test.duplicate_code' },
          'Lab test refused: the code already exists',
        );
      }
      throw error;
    }
  });
}
