import { expect, test } from '@playwright/test';

import { unique } from './helpers';

test('add a patient, get the duplicate warning for the same email, create anyway', async ({
  page,
}) => {
  const lastName = unique('Dup');
  const email = `${lastName.toLowerCase()}@example.test`;

  async function fillNewPatient(firstName: string, dateOfBirth: string) {
    await page.getByLabel('First name').fill(firstName);
    await page.getByLabel('Last name').fill(lastName);
    await page.getByLabel('Date of birth').fill(dateOfBirth);
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Save patient' }).click();
  }

  // The first patient is saved and listed.
  await page.goto('/patients');
  await page.getByRole('link', { name: 'New patient' }).click();
  await fillNewPatient('Alpha', '1985-03-09');
  await page.getByLabel('Search by name').fill(lastName);
  await expect(
    page.getByRole('link', { name: `Alpha ${lastName}`, exact: true }),
  ).toBeVisible();

  // A second patient with the same email gets the warning, naming the first.
  await page.getByRole('link', { name: 'New patient' }).click();
  await fillNewPatient('Beta', '1992-11-30');
  const warning = page.getByRole('alert').filter({
    hasText: 'This patient may already exist',
  });
  await expect(warning).toContainText(`Alpha ${lastName}`);
  await expect(warning).toContainText(`Email: ${email}`);

  // Create anyway saves it: both patients are now listed.
  await warning.getByRole('button', { name: 'Create anyway' }).click();
  await page.getByLabel('Search by name').fill(lastName);
  await expect(
    page.getByRole('link', { name: `Alpha ${lastName}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: `Beta ${lastName}`, exact: true }),
  ).toBeVisible();
});
