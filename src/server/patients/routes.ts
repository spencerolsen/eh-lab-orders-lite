import type { FastifyInstance } from 'fastify';

import { today } from '../../shared/dates';
import { createPatientBody } from '../../shared/patients';
import type { AppDeps } from '../app';
import { withQueryLog } from '../db/query';
import { parse } from '../parse';
import { insertPatient, listPatients } from './repo';

// GET and POST /api/patients (docs/api.md), registered by buildApp.
// Nothing about a patient is logged except its id. A rejected body is logged
// by the error handler, with a count of the failed fields and nothing else.
export function patientRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/api/patients', async (request) => {
    return listPatients(withQueryLog(deps.pool, request.log));
  });

  app.post('/api/patients', async (request, reply) => {
    // "Not in the future" means not after the clinic's today, by the injected clock.
    const clinicToday = today(deps.clinicTimezone, deps.clock());
    const body = parse(createPatientBody(clinicToday), request.body);
    const patient = await insertPatient(
      withQueryLog(deps.pool, request.log),
      body,
    );
    request.log.info(
      { event: 'patient.created', patientId: patient.id },
      'Patient created',
    );
    return reply.code(201).send(patient);
  });
}
