import { expect, test } from '@playwright/test';

import { createOrder, createPatient } from './helpers';

test('advance an order ordered, collected, completed; a completed order offers no actions', async ({
  page,
  request,
}) => {
  const patient = await createPatient(request);
  const orderId = await createOrder(request, patient.id, ['CBC']);

  await page.goto(`/?order=${orderId}`);
  const panel = page.getByRole('dialog', {
    name: `Order for ${patient.fullName}`,
  });
  await expect(panel).toContainText('Ordered');

  await panel.getByRole('button', { name: 'Mark collected' }).click();
  await expect(panel).toContainText('Collected');

  await panel.getByRole('button', { name: 'Mark completed' }).click();
  await expect(panel).toContainText('Completed');

  // Nothing is left to do: only Close.
  await expect(panel.getByRole('button')).toHaveText(['Close']);
});

test('cancel an order: an empty note is refused, then the note and name are shown', async ({
  page,
  request,
}) => {
  const patient = await createPatient(request);
  const orderId = await createOrder(request, patient.id, ['UA']);

  await page.goto(`/?order=${orderId}`);
  const panel = page.getByRole('dialog', {
    name: `Order for ${patient.fullName}`,
  });
  await panel.getByRole('button', { name: 'Cancel order' }).click();

  // An empty note is refused and the order stays as it was.
  await panel.getByLabel('Your name').fill('Sample Staff');
  await panel.getByRole('button', { name: 'Confirm cancel' }).click();
  await expect(panel.getByText('Note is required')).toBeVisible();
  await expect(panel.getByLabel('Note')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(panel).toContainText('Ordered');

  // With a note and a name it is cancelled, and says why and by whom.
  await panel.getByLabel('Note').fill('Patient called to cancel');
  await panel.getByRole('button', { name: 'Confirm cancel' }).click();
  await expect(panel).toContainText('Cancelled by Sample Staff');
  await expect(panel).toContainText('Patient called to cancel');
  await expect(panel.getByRole('button')).toHaveText(['Close']);

  // The status filter finds it.
  await panel.getByRole('button', { name: 'Close' }).click();
  await page
    .getByLabel('Filter by status')
    .selectOption({ label: 'Cancelled' });
  await expect(
    page.getByRole('row').filter({ hasText: patient.fullName }),
  ).toContainText('Cancelled');
});
