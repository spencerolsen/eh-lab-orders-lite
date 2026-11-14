// Small helpers for the journeys. A journey creates its own data, so it can
// run alone or in any order. What the journey is about it does through the
// screens; data it only needs as a starting point it sets up through the API
// (through the web app's own address, which forwards /api to the server).
import type { APIRequestContext, Page } from '@playwright/test';

let counter = 0;

// A word nobody else in the database has: names, emails and searches stay
// unique, however often the tests run against the same data.
export function unique(prefix: string): string {
  counter += 1;
  const stamp = `${Date.now().toString(36)}${counter}`.replace(/\d/g, (digit) =>
    String.fromCharCode(97 + Number(digit)),
  );
  return `${prefix}${stamp}`;
}

export type FakePatient = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
};

export async function createPatient(
  request: APIRequestContext,
): Promise<FakePatient> {
  const firstName = unique('First');
  const lastName = unique('Last');
  const email = `${lastName.toLowerCase()}@example.test`;
  const response = await request.post('/api/patients', {
    data: { firstName, lastName, dateOfBirth: '1990-05-17', email },
  });
  if (!response.ok()) throw new Error(`Could not create a patient`);
  const { id } = (await response.json()) as { id: string };
  return {
    id,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email,
  };
}

// Places an order for the patient with the tests of these codes (as seeded).
export async function createOrder(
  request: APIRequestContext,
  patientId: string,
  codes: string[],
): Promise<string> {
  const tests = (await (await request.get('/api/lab-tests')).json()) as Array<{
    id: string;
    code: string;
  }>;
  const labTestIds = codes.map((code) => {
    const test = tests.find((candidate) => candidate.code === code);
    if (!test) throw new Error(`No lab test with code ${code}`);
    return test.id;
  });
  const response = await request.post('/api/orders', {
    data: { patientId, labTestIds },
  });
  if (!response.ok()) throw new Error('Could not create an order');
  return ((await response.json()) as { id: string }).id;
}

export async function markCollected(
  request: APIRequestContext,
  orderId: string,
): Promise<void> {
  const response = await request.post(`/api/orders/${orderId}/transitions`, {
    data: { to: 'collected' },
  });
  if (!response.ok()) throw new Error('Could not mark an order collected');
}

// In the New order dialog: finds the patient by last name and picks them.
export async function pickPatient(
  page: Page,
  patient: FakePatient,
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'New order' });
  await dialog.getByLabel('Patient').fill(patient.lastName);
  await dialog.getByRole('button', { name: patient.fullName }).click();
}

// In the New order dialog: types in "Add a test" and picks the suggestion
// whose code is shown in bold.
export async function addTest(
  page: Page,
  typed: string,
  code: string,
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'New order' });
  await dialog.getByLabel('Add a test').fill(typed);
  await dialog.getByRole('option', { name: new RegExp(`^${code} `) }).click();
}
