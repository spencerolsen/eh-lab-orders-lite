import { expect, test } from '@playwright/test';

import { addTest, createPatient, pickPatient } from './helpers';

test('place an order from the orders page: the saved order shows the preview total and ready date', async ({
  page,
  request,
}) => {
  const patient = await createPatient(request);
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Place new order', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'New order' });

  // Pick the patient, then add one test by its code and one by its name.
  await pickPatient(page, patient);
  await addTest(page, 'CBC', 'CBC');
  await addTest(page, 'lipid', 'LIPID');
  await expect(
    dialog.getByRole('table', { name: 'Chosen tests' }),
  ).toContainText('LIPID');

  // The preview shows the total (CBC $25.00 + LIPID $38.00) and a ready date.
  const preview = dialog.getByRole('status');
  await expect(preview).toContainText('Total: $63.00');
  await expect(preview).toHaveAttribute('aria-busy', 'false');
  const readyDate = /Estimated ready date: (.+)/.exec(
    (await preview.textContent()) ?? '',
  )?.[1];
  expect(readyDate).toBeTruthy();

  await dialog.getByRole('button', { name: 'Submit order' }).click();
  await expect(dialog).toBeHidden();

  // The list row shows what the preview showed.
  const row = page.getByRole('row').filter({ hasText: patient.fullName });
  await expect(row).toContainText('$63.00');
  await expect(row).toContainText(readyDate!);
  await expect(row).toContainText('Ordered');

  // So does the order panel, which also lists both tests.
  await row
    .getByRole('button', { name: `View order for ${patient.fullName}` })
    .click();
  const panel = page.getByRole('dialog', {
    name: `Order for ${patient.fullName}`,
  });
  await expect(panel).toContainText('CBC');
  await expect(panel).toContainText('LIPID');
  await expect(panel).toContainText('Total $63.00');
  await expect(panel).toContainText(readyDate!);
});

test('a double click on Submit order creates exactly one order', async ({
  page,
  request,
}) => {
  const patient = await createPatient(request);
  await page.goto(`/patients/${patient.id}`);
  await page
    .getByRole('button', { name: 'New order for this patient' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'New order' });
  await addTest(page, 'CBC', 'CBC');
  await expect(dialog.getByRole('status')).toContainText('Total: $25.00');

  await dialog.getByRole('button', { name: 'Submit order' }).dblclick();
  await expect(dialog).toBeHidden();

  // One data row (plus the header row), also after a reload.
  const rows = page.getByRole('row');
  await expect(rows).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('row')).toHaveCount(2);
});

test('New order for this patient opens with the patient chosen, and the order joins their history', async ({
  page,
  request,
}) => {
  const patient = await createPatient(request);
  await page.goto(`/patients/${patient.id}`);
  await expect(page.getByText('No orders yet')).toBeVisible();

  await page
    .getByRole('button', { name: 'New order for this patient' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'New order' });
  await expect(dialog).toContainText(patient.fullName);
  await expect(dialog.getByRole('button', { name: 'Change' })).toBeVisible();

  await addTest(page, 'UA', 'UA');
  await dialog.getByRole('button', { name: 'Submit order' }).click();
  await expect(dialog).toBeHidden();

  const history = page.getByRole('row').filter({ hasText: 'Ordered' });
  await expect(history).toHaveCount(1);
  await expect(history).toContainText('$18.00');
});
