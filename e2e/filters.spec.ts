import { expect, test } from '@playwright/test';

import { createOrder, createPatient, markCollected } from './helpers';

test('filter the orders list by status and by patient; the filters survive a reload', async ({
  page,
  request,
}) => {
  // Patient A has a collected order, patient B an order that is still ordered.
  const a = await createPatient(request);
  const b = await createPatient(request);
  await markCollected(request, await createOrder(request, a.id, ['CBC']));
  await createOrder(request, b.id, ['UA']);

  const rowOf = (name: string) =>
    page.getByRole('row').filter({ hasText: name });
  await page.goto('/');
  await expect(rowOf(a.fullName)).toBeVisible();
  await expect(rowOf(b.fullName)).toBeVisible();

  // By status: only the collected order is left.
  await page
    .getByLabel('Filter by status')
    .selectOption({ label: 'Collected' });
  await expect(rowOf(a.fullName)).toBeVisible();
  await expect(rowOf(b.fullName)).toBeHidden();

  // By patient as well: B has no collected order.
  await page.getByLabel('Filter by patient').fill(b.lastName);
  await page.getByRole('button', { name: b.fullName }).click();
  await expect(page.getByText('No orders match these filters')).toBeVisible();

  // Both filters are kept when the page is loaded again.
  await page.reload();
  await expect(page.getByLabel('Filter by status')).toHaveValue('collected');
  await expect(
    page.getByRole('button', { name: 'Remove patient filter' }),
  ).toBeVisible();
  await expect(page.getByText('No orders match these filters')).toBeVisible();

  // Dropping the status leaves B's order only.
  await page
    .getByLabel('Filter by status')
    .selectOption({ label: 'All statuses' });
  await expect(rowOf(b.fullName)).toBeVisible();
  await expect(rowOf(a.fullName)).toBeHidden();
});

test('sort the orders list by Ready by; the sort survives a reload and combines with a filter', async ({
  page,
  request,
}) => {
  // One patient, two orders: Urinalysis (ready sooner) placed first, Vitamin D
  // (ready later) second, so newest first and ready-date order differ.
  const patient = await createPatient(request);
  await createOrder(request, patient.id, ['UA']);
  const later = await createOrder(request, patient.id, ['VITD']);

  const rows = page.getByRole('row').filter({ hasText: patient.fullName });
  // The ready dates of the patient's rows, top to bottom (the fourth cell).
  const readyDates = () => rows.locator('td:nth-child(4)').allTextContents();
  const readyHeader = page.getByRole('columnheader', { name: /Ready by/ });
  const readyButton = page.getByRole('button', { name: /^Sort by Ready by/ });

  await page.goto(`/?patientId=${patient.id}`);
  await expect(rows).toHaveCount(2);
  const [newestFirst] = await readyDates();

  await readyButton.click();
  await expect(page).toHaveURL(/sort=readyBy&dir=asc/);
  await expect(readyHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect(rows).toHaveCount(2);
  const ascending = await readyDates();
  // Newest first has the later ready date on top; ascending has the sooner.
  expect(ascending[0]).not.toBe(newestFirst);

  // Reload: the same sort, the same order.
  await page.reload();
  await expect(readyHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect(rows).toHaveCount(2);
  expect(await readyDates()).toEqual(ascending);

  // A second click reverses it, and Back undoes that click.
  await readyButton.click();
  await expect(readyHeader).toHaveAttribute('aria-sort', 'descending');
  await expect(rows).toHaveCount(2);
  expect(await readyDates()).toEqual([...ascending].reverse());
  await page.goBack();
  await expect(readyHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect(rows).toHaveCount(2);
  expect(await readyDates()).toEqual(ascending);

  // The sort stays when a filter is added.
  await markCollected(request, later);
  await page.reload();
  await page
    .getByLabel('Filter by status')
    .selectOption({ label: 'Collected' });
  await expect(page).toHaveURL(/status=collected/);
  await expect(page).toHaveURL(/sort=readyBy&dir=asc/);
  await expect(rows).toHaveCount(1);
});
