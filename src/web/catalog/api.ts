// The catalog's calls to the API, each checked with the shared schema.
import {
  type CreateLabTestBody,
  labTestListSchema,
  labTestSchema,
} from '../../shared/lab-tests';
import { apiFetch } from '../api/client';

// The TanStack Query key of the lab test list. Adding a test invalidates it,
// so the list is fetched again and shows the new row.
export const LAB_TESTS_KEY = ['lab-tests'] as const;

export async function fetchLabTests(signal?: AbortSignal) {
  return labTestListSchema.parse(await apiFetch('/api/lab-tests', { signal }));
}

export async function createLabTest(body: CreateLabTestBody) {
  return labTestSchema.parse(
    await apiFetch('/api/lab-tests', { method: 'POST', body }),
  );
}
