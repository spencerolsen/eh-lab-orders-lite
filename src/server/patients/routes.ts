import type { FastifyInstance } from 'fastify';

import { today } from '../../shared/dates';
import {
  createPatientBody,
  patientIdParams,
  patientListQuery,
  updatePatientBody,
} from '../../shared/patients';
import type { AppDeps } from '../app';
import { withQueryLog } from '../db/query';
import { NotFoundError } from '../errors';
import { parse } from '../parse';
import {
  findPatient,
  listPatients,
  searchPatients,
  updatePatient,
} from './repo';
import { createPatient } from './service';

const NOT_FOUND_MESSAGE = 'There is no patient with this id';

// The patient routes (docs/api.md), registered by buildApp.
// Nothing about a patient is logged except its id, and search text is never
// logged: only whether there was any and how many patients it found. A
// rejected request is logged by the error handler, with a count of the failed
// fields and nothing else. Editing a patient runs no duplicate check (LAB-10):
// only POST goes through the patients service.
export function patientRoutes(app: FastifyInstance, deps: AppDeps): void {
  // "Not in the future" means not after the clinic's today, by the injected clock.
  const clinicToday = () => today(deps.clinicTimezone, deps.clock());

  app.get('/api/patients', async (request) => {
    const { q } = parse(patientListQuery, request.query);
    const db = withQueryLog(deps.pool, request.log);
    const patients = q ? await searchPatients(db, q) : await listPatients(db);
    request.log.debug(
      {
        event: 'patient.search',
        hasQuery: Boolean(q),
        resultCount: patients.length,
      },
      'Patients listed',
    );
    return patients;
  });

  app.post('/api/patients', async (request, reply) => {
    // The body is parsed first: an invalid body is a 400, even when it would
    // also match an existing patient. The service runs the duplicate check.
    const body = parse(createPatientBody(clinicToday()), request.body);
    const patient = await createPatient(
      withQueryLog(deps.pool, request.log),
      request.log,
      body,
    );
    return reply.code(201).send(patient);
  });

  app.get('/api/patients/:id', async (request) => {
    const { id } = parse(patientIdParams, request.params);
    const patient = await findPatient(withQueryLog(deps.pool, request.log), id);
    if (!patient) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return patient;
  });

  app.patch('/api/patients/:id', async (request) => {
    const { id } = parse(patientIdParams, request.params);
    const body = parse(updatePatientBody(clinicToday()), request.body);
    const patient = await updatePatient(
      withQueryLog(deps.pool, request.log),
      id,
      body,
    );
    if (!patient) throw new NotFoundError(NOT_FOUND_MESSAGE);
    request.log.info(
      // The names of the fields the request set (fixed names from the
      // schema, never their values).
      {
        event: 'patient.updated',
        patientId: patient.id,
        changedFields: Object.keys(body),
      },
      'Patient updated',
    );
    return patient;
  });
}
