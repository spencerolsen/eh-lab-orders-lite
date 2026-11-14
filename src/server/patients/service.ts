// Creating a patient, with the duplicate warning (LAB-10). The only patient
// service: this is the one patient action with a business rule to own. The
// other patient routes call the repository directly.
import type { FastifyBaseLogger } from 'fastify';

import {
  type CreatePatientBody,
  DUPLICATE_MATCH_LIMIT,
  DUPLICATE_RULES,
  type Patient,
} from '../../shared/patients';
import type { Db } from '../db/query';
import { PossibleDuplicateError } from '../errors';
import { matchRules } from './domain/duplicates';
import { findDuplicateCandidates, insertPatient } from './repo';

// Unless the body says confirmDuplicate: true, looks for likely duplicates
// first; if there are any, creates nothing and throws PossibleDuplicateError
// (409) with them. It warns, it does not guarantee: the check and the insert
// are not locked together, so two identical creates at the same moment can
// both pass it (accepted for this version). confirmDuplicate is never stored:
// insertPatient writes only the patient's own columns.
// Logs carry ids, counts and the fixed rule names, never a patient's details.
export async function createPatient(
  db: Db,
  log: FastifyBaseLogger,
  body: CreatePatientBody,
): Promise<Patient> {
  const confirmed = body.confirmDuplicate === true;
  if (!confirmed) {
    const matches = (await findDuplicateCandidates(db, body))
      .map((patient) => ({ patient, rules: matchRules(body, patient) }))
      .filter((match) => match.rules.length > 0);
    if (matches.length > 0) {
      const matched = new Set(matches.flatMap((match) => match.rules));
      log.warn(
        {
          event: 'patient.possible_duplicate',
          code: 'POSSIBLE_DUPLICATE',
          matchCount: matches.length,
          rules: DUPLICATE_RULES.filter((rule) => matched.has(rule)),
        },
        'Possible duplicate patient; nothing created',
      );
      log.debug(
        {
          event: 'patient.possible_duplicate.matches',
          matches: matches.map((match) => ({
            patientId: match.patient.id,
            rules: match.rules,
          })),
        },
        'Possible duplicate patient ids',
      );
      // The limit applies here, after the rule, so the response lists at
      // most DUPLICATE_MATCH_LIMIT while matchCount is the true count.
      throw new PossibleDuplicateError(
        matches.slice(0, DUPLICATE_MATCH_LIMIT).map((match) => match.patient),
      );
    }
  }
  const patient = await insertPatient(db, body);
  log.info(
    {
      event: 'patient.created',
      patientId: patient.id,
      ...(confirmed ? { duplicateConfirmed: true } : {}),
    },
    'Patient created',
  );
  return patient;
}
