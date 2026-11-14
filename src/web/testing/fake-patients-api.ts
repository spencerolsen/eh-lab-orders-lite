// A fake patients API for component tests, standing in for fetch: /healthz is
// fine; GET /api/patients (with an optional q, matched like the server does),
// GET and PATCH /api/patients/:id, with a 404 for an unknown id and the 422
// CONTACT_REQUIRED when an edit would leave no email or phone, and POST
// /api/patients, with a 409 POSSIBLE_DUPLICATE when the email is already
// taken and the body has no confirmDuplicate: true. (The real duplicate rule
// is tested on the server; one rule is enough for the screens.)
import { vi } from 'vitest';

import type { Patient } from '../../shared/patients';

export const SEEDED: Patient[] = [
  {
    id: 'p1',
    firstName: 'Demo',
    lastName: 'Example',
    dateOfBirth: '2020-02-29',
    email: null,
    phone: '8015550101',
  },
  {
    id: 'p2',
    firstName: 'Jane',
    lastName: 'Smith',
    dateOfBirth: '1984-03-09',
    email: 'jane.smith@example.test',
    phone: null,
  },
];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function error(
  status: number,
  code: string,
  details?: unknown,
  matches?: Patient[],
): Response {
  return json(status, {
    error: {
      code,
      message: `Fake ${code}`,
      requestId: 'req-1',
      details,
      matches,
    },
  });
}

type NewPatient = Omit<Patient, 'id' | 'email' | 'phone'> & {
  email?: string;
  phone?: string;
  confirmDuplicate?: boolean;
};

function create(patients: Patient[], init: RequestInit): Response {
  const { confirmDuplicate, ...body } = JSON.parse(
    init.body as string,
  ) as NewPatient;
  const matches = patients.filter(
    (p) => body.email !== undefined && p.email === body.email,
  );
  if (matches.length > 0 && confirmDuplicate !== true) {
    return error(409, 'POSSIBLE_DUPLICATE', undefined, matches);
  }
  const patient: Patient = {
    id: `new-${patients.length + 1}`,
    email: null,
    phone: null,
    ...body,
  };
  patients.push(patient);
  return json(201, patient);
}

export function fakePatientsApi(patients: Patient[] = structuredClone(SEEDED)) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const { pathname, searchParams } = new URL(url, 'http://localhost');
    if (pathname === '/healthz') {
      return Promise.resolve(json(200, { status: 'ok' }));
    }
    if (pathname === '/api/patients' && init?.method === 'POST') {
      return Promise.resolve(create(patients, init));
    }
    if (pathname === '/api/patients') {
      const q = (searchParams.get('q') ?? '').toLowerCase();
      return Promise.resolve(
        json(
          200,
          patients.filter((p) =>
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(q),
          ),
        ),
      );
    }
    const id = pathname.replace('/api/patients/', '');
    const patient = patients.find((p) => p.id === id);
    if (!patient) return Promise.resolve(error(404, 'NOT_FOUND'));
    if (init?.method === 'PATCH') {
      const changes = JSON.parse(init.body as string) as Partial<Patient>;
      const next = { ...patient, ...changes };
      if (next.email === null && next.phone === null) {
        return Promise.resolve(
          error(422, 'CONTACT_REQUIRED', [
            {
              field: 'email',
              reason: 'is required when there is no phone number',
            },
            { field: 'phone', reason: 'is required when there is no email' },
          ]),
        );
      }
      Object.assign(patient, next);
    }
    return Promise.resolve(json(200, patient));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

// The URLs of the requests made so far, in order.
export function requestedUrls(fetch: ReturnType<typeof fakePatientsApi>) {
  return fetch.mock.calls.map(([url]) => url);
}
