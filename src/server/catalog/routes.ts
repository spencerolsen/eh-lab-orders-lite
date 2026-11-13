// The lab test catalog routes, added to the app in app.ts. No service
// layer: each route parses its input and calls one repository function, and
// the only rule beyond the input's shape (a unique code) is the database's.
// There is no DELETE: tests are deactivated, never deleted, because orders
// point at them. A DELETE gets the standard 404 from the not-found handler.
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import {
  createLabTestBody,
  labTestParams,
  updateLabTestBody,
} from '../../shared/lab-tests';
import { withQueryLog } from '../db/query';
import { ConflictError, NotFoundError } from '../errors';
import { parse } from '../parse';
import { createLabTest, listLabTests, updateLabTest } from './repo';

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

  // PATCH /api/lab-tests/:id: 200 with the updated test, 404 NOT_FOUND. The
  // body may not hold `code` (it never changes) or be empty: both are a 400.
  app.patch('/api/lab-tests/:id', async (request) => {
    const { id } = parse(labTestParams, request.params);
    const changes = parse(updateLabTestBody, request.body);
    const result = await updateLabTest(
      withQueryLog(pool, request.log),
      id,
      changes,
    );
    if (result === null) {
      throw new NotFoundError('There is no lab test with this id');
    }
    const { labTest, wasActive } = result;
    // Ids and counts only: never the values, nor even the field names.
    // Switching a test on or off is named, so it can be traced later.
    const active =
      labTest.isActive === wasActive
        ? {}
        : { active: labTest.isActive ? 'activated' : 'deactivated' };
    request.log.info(
      {
        event: 'lab_test.updated',
        labTestId: labTest.id,
        fieldCount: Object.keys(changes).length,
        ...active,
      },
      'Lab test updated',
    );
    return labTest;
  });
}
